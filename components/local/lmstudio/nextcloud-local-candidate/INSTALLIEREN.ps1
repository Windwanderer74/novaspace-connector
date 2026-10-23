# SPDX-License-Identifier: AGPL-3.0-or-later
param(
  [ValidateSet('Soul','OtherUser')][string]$Konto = 'Soul',
  [switch]$Zurueck,
  [switch]$ErsterAusbau,
  [ValidateSet('deck','files','calendar','tables','mindmap','communication')][string[]]$Bereiche
)
$ErrorActionPreference = 'Stop'
$pythonPath = Join-Path $env:LOCALAPPDATA 'NOVAFORGE\Programme\nextcloud-mcp-pilot\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Vorhandene Python-Umgebung fehlt. Keine Neuinstallation ausgeführt.' }
$arguments = @((Join-Path $PSScriptRoot 'install.py'), '--expected-user', $Konto)
if ($Zurueck) { $arguments += '--restore' }
if ($Zurueck -and ($ErsterAusbau -or $Bereiche)) { throw 'Ruecksetzung und Ausbauauswahl getrennt aufrufen.' }
if ($ErsterAusbau) {
  $arguments += @('--enable-scope','files:pdfread','--enable-scope','files:download','--enable-scope','files:organize','--enable-scope','tables:read')
}
if ($Bereiche) { $arguments += @('--groups') + $Bereiche }
& $pythonPath @arguments
if ($LASTEXITCODE -ne 0) { throw 'Update nicht abgeschlossen. Fehlermeldung oben beachten; nicht wiederholt installieren.' }
