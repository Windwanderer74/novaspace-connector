# SPDX-License-Identifier: AGPL-3.0-or-later
$ErrorActionPreference = 'Stop'
$wanted = @('nextcloud-pilot-next2', 'novaforge-hosted-deck', 'novaforge-arbeitsraum')
$configPath = Join-Path $env:USERPROFILE '.lmstudio\mcp.json'
try {
    $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    throw 'LM-Studio-Konfiguration konnte nicht gelesen werden. Keine Änderung vorgenommen.'
}
$result = foreach ($name in $wanted) {
    $property = $config.mcpServers.PSObject.Properties | Where-Object Name -eq $name
    if (-not $property) {
        [pscustomobject]@{ Name = $name; Vorhanden = $false }
        continue
    }
    $entry = $property.Value
    $commandPath = '(Startprogramm zuerst lokal prüfen)'
    if ($entry.command -is [string] -and (Test-Path -LiteralPath $entry.command -PathType Leaf)) {
        $commandPath = (Resolve-Path -LiteralPath $entry.command).Path
    } elseif ($entry.command -is [string] -and $entry.command -match '^[A-Za-z0-9_.-]+$') {
        $commandPath = $entry.command
    }
    $paths = @($entry.args | Where-Object {
        $_ -is [string] -and $_ -match '\.(py|js|cjs|mjs)$' -and
        (Test-Path -LiteralPath $_ -PathType Leaf)
    })
    $localInfo = $null
    foreach ($scriptPath in $paths) {
        if ([IO.Path]::GetFileName($scriptPath) -ne 'start_local.py') { continue }
        $root = Split-Path -Parent $scriptPath
        try {
            $local = Get-Content -LiteralPath (Join-Path $root 'local.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            $receipt = Get-Content -LiteralPath (Join-Path $root 'installation.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            $localInfo = [pscustomobject]@{
                Version = $receipt.version
                Basisadresse = $local.baseUrl
                ErwartetesKonto = $local.expectedUser
                Freigaben = @($local.scopes)
                Bereiche = @($local.groups)
                NodePfad = $local.nodePath
                UrspruenglicherStartpfad = $local.legacyLauncher
            }
        } catch {
            $localInfo = 'Lokale Versionsdaten nicht lesbar; keine Änderung vorgenommen.'
        }
    }
    [pscustomobject]@{
        Name = $name
        Vorhanden = $true
        Startprogramm = $commandPath
        VorhandeneSkriptpfade = $paths
        Lokal = $localInfo
    }
}
# Only the selected, non-secret fields are output. No env values, raw args,
# passwords, protected credential files or complete configuration are printed.
$result | ConvertTo-Json -Depth 8
