# Despliegue al STACK POR RED (Docker Desktop local, http://<ip>:8080).
# Es reversible y va SIEMPRE antes que produccion. Detalle: docs/despliegue/README.md
#
# Pasos: limpia variables del shell -> respalda con pg_dump (-Fc) y valida la
# cabecera PGDMP -> build en segundo plano con sondeo del log -> migrate deploy
# -> up -d --force-recreate -> verificacion (conteos antes/despues y GET).
#
# Uso:
#   .\deploy-red.ps1 -Nombre bitacora -DryRun
#   .\deploy-red.ps1 -Nombre bitacora -RepoDir C:\ruta\al\repo
#
# El archivo .env.production del stack por red NO esta en git: vive en -RepoDir
# (por defecto la raiz de este repo). Sin secretos en este script.
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$')][string]$Nombre,
  [string]$RepoDir,
  [string]$EnvFile = '.env.production',
  # Nombre del proyecto compose: fija los contenedores control-phari-*-1 aunque
  # el codigo este en un worktree con otro nombre de carpeta.
  [string]$Proyecto = 'control-phari',
  [string]$BackupDir = $(Join-Path $env:USERPROFILE 'control-phari-backups'),
  [string]$BaseUrl = 'http://localhost:8080',
  [int]$MinBytesDump = 100000,
  [int]$SondeoSegundos = 15,
  [int]$MaxMinutosBuild = 25,
  [switch]$Yes,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
if (-not $RepoDir) { $RepoDir = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\..')).Path }
$ts = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd'), $Nombre
$dump = Join-Path $BackupDir "stack-red-$ts-pre.dump"
$logBuild = Join-Path $BackupDir "build-red-$ts.log"
$logMigrate = Join-Path $BackupDir "migrate-red-$ts.log"
$logUp = Join-Path $BackupDir "up-red-$ts.log"
$compose = @('compose', '-p', $Proyecto, '-f', 'compose.prod.yaml', '--env-file', $EnvFile)
$conteosSql = @"
select 'migraciones=' || count(*) from _prisma_migrations where finished_at is not null;
select 'ultima=' || migration_name from _prisma_migrations order by finished_at desc limit 1;
select 'users=' || count(*) from users;
select 'requests=' || count(*) from requests;
select 'plans=' || count(*) from plans;
select 'tasks=' || count(*) from tasks;
select 'audit_events=' || count(*) from audit_events;
select 'daily_logs=' || count(*) from daily_logs;
"@

function Info($m) { Write-Host "[deploy-red] $m" }
function Paso($m) { Write-Host ""; Write-Host "== $m ==" }
function Ejecutar([string]$desc, [scriptblock]$bloque) {
  if ($DryRun) { Info "[DRY-RUN] $desc"; return }
  & $bloque
}
function Conteos {
  $conteosSql | docker exec -i "$Proyecto-postgres-1" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'
}

Info "TS=$ts RepoDir=$RepoDir Proyecto=$Proyecto DryRun=$([bool]$DryRun)"

# 1. Variables del shell que contaminan el build y compose --------------------
Paso '1/7 limpiar variables del shell'
$sucias = Get-ChildItem Env: | Where-Object { $_.Name -match '^(NEXT_PUBLIC_.*|DATABASE_URL|AUTH_MODE|CORS_ORIGINS|PORT|E2E_.*)$' }
foreach ($v in $sucias) { Info "quita $($v.Name)"; if (-not $DryRun) { Remove-Item "Env:$($v.Name)" } }
if (-not $sucias) { Info 'ninguna variable que limpiar' }

# 2. Requisitos --------------------------------------------------------------
Paso '2/7 requisitos'
if ($DryRun) {
  Info '[DRY-RUN] docker info (Docker Desktop debe responder)'
  Info "[DRY-RUN] existe $(Join-Path $RepoDir $EnvFile) y compose.prod.yaml"
}
else {
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop no responde (docker info).' }
  foreach ($f in @('compose.prod.yaml', $EnvFile)) {
    if (-not (Test-Path (Join-Path $RepoDir $f))) { throw "Falta $f en $RepoDir" }
  }
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
}
Set-Location $RepoDir

# 3. Respaldo validado --------------------------------------------------------
Paso "3/7 pg_dump validado -> $dump"
Ejecutar 'cmd /c docker exec <proyecto>-postgres-1 sh -c "pg_dump -U $POSTGRES_USER -d $POSTGRES_DB -Fc" > <dump>' {
  # cmd escribe bytes tal cual; el operador > de PowerShell corrompe el binario.
  $cmdLine = 'docker exec {0}-postgres-1 sh -c "pg_dump -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -Fc" > "{1}"' -f $Proyecto, $dump
  $bat = Join-Path ([IO.Path]::GetTempPath()) "dump-red-$ts.cmd"
  [IO.File]::WriteAllText($bat, "@echo off`r`n$cmdLine`r`n", (New-Object Text.ASCIIEncoding))
  try { cmd /c $bat } finally { Remove-Item -LiteralPath $bat -Force -ErrorAction SilentlyContinue }
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump fallo.' }
  $bytes = New-Object byte[] 5
  $fs = [IO.File]::OpenRead($dump)
  try { $null = $fs.Read($bytes, 0, 5) } finally { $fs.Dispose() }
  $cabecera = [Text.Encoding]::ASCII.GetString($bytes)
  $tam = (Get-Item $dump).Length
  Info "dump: $tam bytes, cabecera=$cabecera"
  if ($cabecera -ne 'PGDMP' -or $tam -lt $MinBytesDump) { throw 'Respaldo invalido (cabecera distinta de PGDMP o muy pequeno). No se continua.' }
}
Ejecutar 'conteos ANTES' { $script:antes = @(Conteos); $script:antes | ForEach-Object { Info "antes  $_" } }
if (-not $Yes -and -not $DryRun) {
  if ((Read-Host 'Respaldo OK. Construir y desplegar al stack por red? [Enter = si, n = cancelar]') -match '^(n|no)$') { throw 'Cancelado por el usuario.' }
}

# 4. Build en segundo plano con sondeo del log ---------------------------------
Paso "4/7 build en segundo plano (log: $logBuild)"
if ($DryRun) {
  Info "[DRY-RUN] docker $($compose -join ' ') build   (stdout/stderr -> $logBuild; sondeo cada ${SondeoSegundos}s)"
}
else {
  $p = Start-Process -FilePath docker -ArgumentList ($compose + 'build') -WorkingDirectory $RepoDir `
    -RedirectStandardOutput $logBuild -RedirectStandardError "$logBuild.err" -NoNewWindow -PassThru
  $limite = (Get-Date).AddMinutes($MaxMinutosBuild)
  while (-not $p.HasExited -and (Get-Date) -lt $limite) {
    Start-Sleep -Seconds $SondeoSegundos
    $ultima = @(Get-Content $logBuild, "$logBuild.err" -Tail 1 -ErrorAction SilentlyContinue | Where-Object { $_ })[-1]
    Info "build en curso: $ultima"
  }
  if (-not $p.HasExited) { $p.Kill(); throw "El build supero $MaxMinutosBuild min y se detuvo. Revisa $logBuild" }
  if ($p.ExitCode -ne 0) {
    $err = Get-Content $logBuild, "$logBuild.err" -ErrorAction SilentlyContinue | Select-String 'failed to resolve source metadata|docker.io|ERROR' | Select-Object -First 5
    $err | ForEach-Object { Write-Host $_.Line }
    throw "El build fallo (codigo $($p.ExitCode)). Si dice 'docker.io' o 'failed to resolve', Docker no llega a Docker Hub: usa las imagenes base ya descargadas. Log: $logBuild"
  }
  Info 'build OK'
}

# 5. Migraciones --------------------------------------------------------------
Paso '5/7 prisma migrate deploy'
Ejecutar "docker $($compose -join ' ') run --rm api npm run prisma:migrate:deploy --workspace apps/api  (-> $logMigrate)" {
  & docker @compose run --rm api npm run prisma:migrate:deploy --workspace apps/api *>&1 | Tee-Object -FilePath $logMigrate | Select-Object -Last 8
  if ($LASTEXITCODE -ne 0) { throw "migrate deploy fallo. Restaura con el dump $dump solo tras hablarlo con el usuario." }
}

# 6. Recrear servicios ---------------------------------------------------------
Paso '6/7 up -d --force-recreate'
Ejecutar "docker $($compose -join ' ') up -d --force-recreate api web mcp nginx  (-> $logUp)" {
  & docker @compose up -d --force-recreate api web mcp nginx *>&1 | Tee-Object -FilePath $logUp | Select-Object -Last 6
  if ($LASTEXITCODE -ne 0) { throw 'up -d fallo.' }
}

# 7. Verificacion --------------------------------------------------------------
Paso '7/7 verificacion (solo GET)'
function Codigo([string]$url, [string[]]$extra = @()) { & curl.exe -s -o NUL -w '%{http_code}' @extra $url }
if ($DryRun) {
  Info "[DRY-RUN] espera hasta 120 s a $BaseUrl/api/health/ready (200)"
  Info "[DRY-RUN] GET $BaseUrl/login sin 'localhost:3001'; X-Actor-Id sin token -> 401; AUTH_MODE del contenedor api"
  Info '[DRY-RUN] conteos DESPUES vs ANTES; las diferencias se explican con audit_events'
}
else {
  $ok = $false
  for ($i = 0; $i -lt 24 -and -not $ok; $i++) {
    Start-Sleep -Seconds 5
    $ok = (Codigo "$BaseUrl/api/health/ready") -eq '200'
  }
  Info "ready: $(if ($ok) { 200 } else { 'NO RESPONDE' })"
  Info "AUTH_MODE api: $(docker exec "$Proyecto-api-1" sh -c 'echo $AUTH_MODE')"
  Info "login html con localhost:3001 (debe ser 0): $(((& curl.exe -s "$BaseUrl/login") | Select-String 'localhost:3001' | Measure-Object).Count)"
  Info "X-Actor-Id sin token /api/requests (esperado 401): $(Codigo "$BaseUrl/api/requests" @('-H', 'X-Actor-Id: x'))"
  $despues = @(Conteos)
  $dif = Compare-Object $script:antes $despues
  if ($dif) {
    Write-Warning 'Los conteos cambiaron. El equipo trabaja a cualquier hora: revisa audit_events antes de darlo por bueno.'
    $dif | ForEach-Object { Info "$($_.SideIndicator) $($_.InputObject)" }
  }
  else { Info 'conteos sin diferencias' }
  if (-not $ok) { throw 'La API no respondio como lista tras recrear los servicios.' }
}
Info "Listo. Rollback del stack por red: restaurar $dump (con el usuario) y reconstruir la rama anterior."
