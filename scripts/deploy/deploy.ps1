# Orquestador LOCAL del despliegue a produccion (EC2 por AWS SSM).
# Procedimiento completo, requisitos y rollback: docs/despliegue/README.md
#
# Que hace (con pausas para que una persona revise cada etapa):
#   1. preflight (solo lectura)
#   2. git archive de <Ref> (excluye .agents y e2e) -> S3 -> URL prefirmada
#   3. prep: respaldo gestionado, pg_dump validado, codigo nuevo, run-<TS>.sh
#   4. launch: lanza el despliegue en segundo plano; watch: sondea el log
#   5. verify: solo GET + conteos antes/despues
#   6. limpieza: borra el paquete de S3 y los archivos locales con la URL
#
# Los scripts concretos se generan en una carpeta temporal FUERA del repo
# ($env:TEMP\control-phari-deploy-<TS>) y se borran al terminar.
#
# Ejemplos:
#   .\deploy.ps1 -Nombre bitacora -DryRun
#   .\deploy.ps1 -Nombre ids-visibles -Bucket mi-bucket-temporal `
#       -VerificacionSql ..\verificar-ids-visibles.sql
#   .\deploy.ps1 -Nombre gracia -Bucket mi-bucket-temporal `
#       -SeedSql .\ejemplos\seed-param-gracia.sql
#
# No lleva secretos. Nunca se despliega sin que el usuario lo haya pedido.
param(
  # Etiqueta corta del despliegue; el TS queda <yyyyMMdd>-<Nombre>.
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$')][string]$Nombre,
  [string]$Ref = 'main',
  # Bucket S3 temporal para el paquete (se borra el objeto al terminar).
  [string]$Bucket = $env:PORTAL_DEPLOY_BUCKET,
  [string]$Prefijo = '_deploy',
  [string]$Region = $(if ($env:PORTAL_AWS_REGION) { $env:PORTAL_AWS_REGION } else { 'us-east-2' }),
  [string]$InstanceId = $(if ($env:PORTAL_SSM_INSTANCE) { $env:PORTAL_SSM_INSTANCE } else { 'i-0879c4806eab55546' }),
  # Por defecto se ensayan las migraciones sobre una copia de la BD. Este
  # interruptor las omite; solo para despliegues sin migraciones nuevas.
  [switch]$SinEnsayo,
  # SQL de verificacion (filas "comprobacion|violaciones"); si alguna da
  # distinto de 0 en la copia o en la BD real, el despliegue aborta.
  [string]$VerificacionSql,
  # SQL idempotente con los parametros nuevos del seed (ON CONFLICT DO NOTHING).
  [string]$SeedSql,
  [int]$ExpiraSegundos = 3600,
  [int]$SondeoSegundos = 20,
  [int]$MaxMinutosDespliegue = 30,
  # Se detiene tras el preflight.
  [switch]$SoloPreflight,
  # No pide confirmaciones intermedias (solo para ensayos controlados).
  [switch]$Yes,
  # No toca AWS: imprime lo que haria y valida los scripts generados.
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$qui = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $qui '..\..')).Path
$ts = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd'), $Nombre
$work = Join-Path ([IO.Path]::GetTempPath()) "control-phari-deploy-$ts"
$key = '{0}/control-phari-{1}.tar.gz' -f $Prefijo.Trim('/'), $ts
$utf8 = New-Object Text.UTF8Encoding $false
$ssm = Join-Path $qui 'ssm-run.ps1'
$subido = $false

function Info($m) { Write-Host "[deploy] $m" }
function Pausa($m) {
  if ($DryRun -or $Yes) { Info "(pausa omitida) $m"; return }
  $r = Read-Host "$m  [Enter = continuar, n = cancelar]"
  if ($r -match '^(n|no)$') { throw 'Cancelado por el usuario.' }
}
function Rellenar([string]$archivo, [hashtable]$map) {
  $t = [IO.File]::ReadAllText((Join-Path $qui $archivo))
  foreach ($k in $map.Keys) { $t = $t.Replace("@@$k@@", [string]$map[$k]) }
  if ($t -match '@@[A-Z_0-9]+@@') { throw "Quedaron marcadores sin sustituir en $archivo : $($Matches[0])" }
  return $t.Replace("`r`n", "`n")
}
function Escribir([string]$nombre, [string]$texto) {
  $p = Join-Path $work $nombre
  [IO.File]::WriteAllText($p, $texto, $utf8)
  return $p
}
function Ssm([string]$nombre, [string]$script, [int]$timeout) {
  $out = Join-Path $work "$nombre.out"
  $estado = @(& $ssm -ScriptFile $script -OutFile $out -Timeout $timeout -Region $Region -InstanceId $InstanceId -DryRun:$DryRun)[-1]
  $txt = ''
  if (-not $DryRun -and (Test-Path $out)) {
    $txt = [IO.File]::ReadAllText($out)
    Write-Host $txt
  }
  return [pscustomobject]@{ Estado = $estado; Texto = $txt }
}
function Limpiar-Paquete {
  if ($script:subido -and -not $DryRun) {
    Info "borrando s3://$Bucket/$key"
    aws s3 rm "s3://$Bucket/$key" --region $Region | Out-Null
    $script:subido = $false
  }
}

try {
  Info "TS=$ts Ref=$Ref Region=$Region Instancia=$InstanceId SinEnsayo=$([bool]$SinEnsayo) DryRun=$([bool]$DryRun)"
  if (-not $DryRun) {
    if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { throw 'AWS CLI no esta instalado o no esta en el PATH.' }
    if (-not $Bucket) { throw 'Falta -Bucket (o la variable PORTAL_DEPLOY_BUCKET).' }
    aws sts get-caller-identity --region $Region --output text | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'AWS CLI sin credenciales validas (aws sts get-caller-identity fallo).' }
  }
  if (-not $Bucket) { $Bucket = '<bucket-temporal>' }
  git -C $repo rev-parse --verify --quiet "$Ref^{commit}" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "La referencia '$Ref' no existe en el repositorio." }
  $commit = (git -C $repo rev-parse --short $Ref).Trim()
  Info "se desplegara $Ref ($commit)"

  New-Item -ItemType Directory -Force -Path $work | Out-Null

  $verifB64 = ''
  if ($VerificacionSql) {
    $verifB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path $VerificacionSql)))
  }
  $seedB64 = ''
  if ($SeedSql) {
    $seedB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path $SeedSql)))
  }

  # --- 1. preflight -------------------------------------------------------
  Info '1/6 preflight (solo lectura)'
  $pre = Escribir 'preflight.sh' (Rellenar 'preflight.sh' @{})
  $r = Ssm 'preflight' $pre 300
  if (-not $DryRun -and $r.Estado -ne 'Success') { throw "Preflight termino en estado $($r.Estado)." }
  if ($SoloPreflight) { Info 'Fin (-SoloPreflight).'; return }
  Pausa 'Revisa el preflight (migraciones y conteos). Continuar con el paquete y la preparacion'

  # --- 2. paquete: git archive -> S3 -> URL prefirmada ----------------------
  Info "2/6 paquete: git archive $Ref (sin .agents ni e2e) -> s3://$Bucket/$key"
  $paquete = Join-Path $work 'paquete.tar.gz'
  $url = 'https://dry-run.invalid/paquete.tar.gz'
  if ($DryRun) {
    Info "[DRY-RUN] git -C $repo archive --format=tar.gz -o <paquete> $Ref -- ':(exclude).agents' ':(exclude)e2e'"
    Info "[DRY-RUN] aws s3 cp <paquete> s3://$Bucket/$key --region $Region"
    Info "[DRY-RUN] aws s3 presign s3://$Bucket/$key --expires-in $ExpiraSegundos --region $Region"
  }
  else {
    git -C $repo archive --format=tar.gz -o $paquete $Ref -- ':(exclude).agents' ':(exclude)e2e'
    if ($LASTEXITCODE -ne 0) { throw 'git archive fallo.' }
    Info ("paquete: {0:N1} MB" -f ((Get-Item $paquete).Length / 1MB))
    aws s3 cp $paquete "s3://$Bucket/$key" --region $Region --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Subida a S3 fallo (permisos del bucket).' }
    $subido = $true
    $url = (aws s3 presign "s3://$Bucket/$key" --expires-in $ExpiraSegundos --region $Region).Trim()
    if (-not $url.StartsWith('https://')) { throw 'No se obtuvo la URL prefirmada.' }
  }

  # --- 3. preparacion -------------------------------------------------------
  Info '3/6 prep: respaldo gestionado, pg_dump validado, codigo nuevo (no toca los contenedores)'
  $map = @{ TS = $ts; URL = $url; ENSAYO = $(if ($SinEnsayo) { 0 } else { 1 }); VERIF_B64 = $verifB64; SEED_B64 = $seedB64 }
  $prep = Escribir 'prep.sh' (Rellenar 'prep.sh.tpl' $map)
  $r = Ssm 'prep' $prep 900
  # La URL ya no hace falta: se borra el paquete de S3 y el archivo local.
  Remove-Item -LiteralPath $prep -Force -ErrorAction SilentlyContinue
  Limpiar-Paquete
  if (-not $DryRun -and ($r.Estado -ne 'Success' -or $r.Texto -notmatch 'PREP_OK')) {
    throw "La preparacion fallo (estado $($r.Estado)). La BD real no se toco; revisa la salida."
  }
  Pausa 'Revisa conteos ANTES, RESPALDO_OK, dump PGDMP y migraciones nuevas. Lanzar el despliegue (migra la BD real)'

  # --- 4. lanzar y vigilar --------------------------------------------------
  Info '4/6 launch'
  $launch = Escribir 'launch.sh' (Rellenar 'launch.sh' @{ TS = $ts })
  $watch = Escribir 'watch.sh' (Rellenar 'watch.sh' @{ TS = $ts })
  $null = Ssm 'launch' $launch 120
  Info '5/6 watch (sondeo del log hasta que termine)'
  $limite = (Get-Date).AddMinutes($MaxMinutosDespliegue)
  $terminado = $false
  do {
    if (-not $DryRun) { Start-Sleep -Seconds $SondeoSegundos }
    $r = Ssm 'watch' $watch 120
    if ($DryRun) { $terminado = $true }
    elseif ($r.Texto -match 'ESTADO=TERMINADO_OK') { $terminado = $true }
    elseif ($r.Texto -match 'ESTADO=TERMINADO_CON_ERROR') { throw "El despliegue termino con error (ver deploy-$ts.log en el servidor). Rollback: docs/despliegue/README.md" }
  } while (-not $terminado -and (Get-Date) -lt $limite)
  if (-not $terminado) { throw "El despliegue no termino en $MaxMinutosDespliegue min; revisa el servidor antes de reintentar." }

  # --- 5. verificar ---------------------------------------------------------
  Pausa 'Despliegue terminado. Ejecutar la verificacion (solo GET)'
  Info '6/6 verify'
  $verify = Escribir 'verify.sh' (Rellenar 'verify.sh' @{ TS = $ts })
  $r = Ssm 'verify' $verify 600
  if (-not $DryRun -and $r.Texto -match 'HAY DIFERENCIAS') {
    Write-Warning 'Hay diferencias de conteos: comparalas con audit_events (arriba) antes de darlas por buenas.'
  }
  Info "Listo. Rollback: imagenes control-phari-<api|web|mcp>:prev-$ts y /opt/control-phari.prev-$ts (docs/despliegue/README.md)."
}
finally {
  Limpiar-Paquete
  if (Test-Path $work) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
}
