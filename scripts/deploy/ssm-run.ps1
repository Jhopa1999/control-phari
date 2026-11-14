# Ejecuta un script bash en la instancia por AWS Systems Manager (sin SSH) y
# guarda STATUS, stdout y stderr en un archivo .out.
#
# Uso:
#   .\ssm-run.ps1 -ScriptFile .\verify.sh -OutFile .\verify.out
#   .\ssm-run.ps1 -ScriptFile .\verify.sh -OutFile .\verify.out -DryRun
#
# Instancia y región: parámetro > variable de entorno > valor por defecto.
#   PORTAL_SSM_INSTANCE  (por defecto i-0879c4806eab55546, "EC2 Vigia")
#   PORTAL_AWS_REGION    (por defecto us-east-2)
# Los scripts no deben llevar secretos: el contenido viaja en el historial de
# comandos de SSM. Devuelve el estado final (Success, Failed, TimedOut...).
param(
  [Parameter(Mandatory = $true)][string]$ScriptFile,
  [Parameter(Mandatory = $true)][string]$OutFile,
  [int]$Timeout = 900,
  [string]$Region = $(if ($env:PORTAL_AWS_REGION) { $env:PORTAL_AWS_REGION } else { 'us-east-2' }),
  [string]$InstanceId = $(if ($env:PORTAL_SSM_INSTANCE) { $env:PORTAL_SSM_INSTANCE } else { 'i-0879c4806eab55546' }),
  [int]$MaxEsperaSegundos = 1200,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'

if (-not (Test-Path -LiteralPath $ScriptFile)) { throw "No existe el script: $ScriptFile" }
$raw = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $ScriptFile)).Replace("`r`n", "`n")

if ($DryRun) {
  Write-Host "[DRY-RUN] aws ssm send-command --region $Region --instance-ids $InstanceId (AWS-RunShellScript, timeout ${Timeout}s)"
  Write-Host "[DRY-RUN] script: $ScriptFile ($($raw.Length) caracteres) -> salida en $OutFile"
  return 'DryRun'
}

$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($raw))
# El script temporal se borra del servidor al terminar (puede contener una URL prefirmada).
$cmd = "echo $b64 | base64 -d > /tmp/ssm-job.sh && { bash /tmp/ssm-job.sh; rc=`$?; rm -f /tmp/ssm-job.sh; exit `$rc; }"
$params = @{ commands = @($cmd); executionTimeout = @("$Timeout") } | ConvertTo-Json -Compress
$pf = Join-Path ([IO.Path]::GetTempPath()) ("ssm-params-" + [guid]::NewGuid().ToString('N') + '.json')
[IO.File]::WriteAllText($pf, $params, (New-Object Text.UTF8Encoding $false))
try {
  $send = aws ssm send-command --region $Region --instance-ids $InstanceId --document-name AWS-RunShellScript --parameters "file://$pf" --output json | ConvertFrom-Json
  if (-not $send) { throw 'aws ssm send-command no devolvio respuesta (revisa credenciales y permisos).' }
  $id = $send.Command.CommandId
  $status = 'InProgress'
  $inv = $null
  $limite = [DateTime]::UtcNow.AddSeconds($MaxEsperaSegundos)
  while ([DateTime]::UtcNow -lt $limite) {
    Start-Sleep -Seconds 5
    $inv = aws ssm get-command-invocation --region $Region --command-id $id --instance-id $InstanceId --output json 2>$null | ConvertFrom-Json
    if ($inv -and $inv.Status -notin @('InProgress', 'Pending', 'Delayed')) { $status = $inv.Status; break }
  }
  $out = "STATUS: $status`n--- STDOUT ---`n$($inv.StandardOutputContent)`n--- STDERR ---`n$($inv.StandardErrorContent)"
  [IO.File]::WriteAllText($OutFile, $out, (New-Object Text.UTF8Encoding $false))
  return $status
}
finally {
  Remove-Item -LiteralPath $pf -Force -ErrorAction SilentlyContinue
}
