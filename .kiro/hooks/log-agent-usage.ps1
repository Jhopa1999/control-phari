param(
    [Parameter(Mandatory = $true)]
    [string]$Event,

    # Nombre del agente. Kiro NO lo entrega por stdin, asi que cada agente lo
    # pasa explicitamente desde sus hooks (ver bloque "hooks" en .kiro/agents/*.md).
    # Si no se pasa, queda como 'default' (agente por defecto, sin perfil).
    [string]$Agent = ''
)

# Lee el contexto de sesion que Kiro envia por stdin (JSON).
$raw = [Console]::In.ReadToEnd()

$ctx = $null
$sessionId = ''
$eventName = ''
$cwd = ''

function Get-Field($obj, [string[]]$names) {
    if ($null -eq $obj) { return '' }
    foreach ($n in $names) {
        if ($obj.PSObject.Properties.Name -contains $n -and -not [string]::IsNullOrWhiteSpace([string]$obj.$n)) {
            return [string]$obj.$n
        }
    }
    return ''
}

function Clean-Text([string]$text, [int]$max = 500) {
    if ([string]::IsNullOrWhiteSpace($text)) { return '' }
    $t = ($text -replace "\r?\n", ' ').Trim()
    if ($t.Length -gt $max) { $t = $t.Substring(0, $max) + '...' }
    return $t
}

if (-not [string]::IsNullOrWhiteSpace($raw)) {
    try {
        $ctx = $raw | ConvertFrom-Json
        $sessionId = $ctx.session_id
        $eventName = $ctx.hook_event_name
        $cwd = $ctx.cwd
    }
    catch {
        $ctx = $null
    }
}

# Nombre del agente: el valor pasado por -Agent tiene prioridad. Si no viene,
# intentamos el payload (por si una version futura de Kiro lo incluyera), y
# finalmente caemos a 'default'.
$agent = $Agent
if ([string]::IsNullOrWhiteSpace($agent)) {
    $agent = Get-Field $ctx @('agent_name', 'agentName', 'agent', 'agent_id', 'agentId', 'persona', 'profile')
}
if ([string]::IsNullOrWhiteSpace($agent)) { $agent = 'default' }

$ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

# Construye el detalle legible segun el tipo de evento.
switch ($Event) {
    'INICIO' {
        $detalle = 'uso=Arranque de sesion/agente'
    }
    'FIN' {
        $detalle = 'uso=Fin de ejecucion del agente'
    }
    'PROMPT' {
        $prompt = Get-Field $ctx @('prompt', 'user_prompt', 'message', 'text', 'input')
        if ([string]::IsNullOrWhiteSpace($prompt)) {
            $prompt = Clean-Text $raw
        }
        $detalle = "porque=$(Clean-Text $prompt)"
    }
    'ACCION' {
        $tool = Get-Field $ctx @('tool_name', 'toolName', 'tool')
        if ([string]::IsNullOrWhiteSpace($tool)) { $tool = 'desconocida' }
        $detalle = "hizo=tool:$tool"
    }
    default {
        $detalle = "uso=$Event"
    }
}

# Padding para que las columnas queden alineadas.
$evtCol = $Event.PadRight(6)

$line = "[$ts] $evtCol | agente=$agent | $detalle | evento=$eventName | sesion=$sessionId | cwd=$cwd"

# Ruta del log relativa a la raiz del workspace (cwd del hook).
$logPath = Join-Path (Get-Location) '.kiro/agent-usage.log'

Add-Content -Path $logPath -Value $line
