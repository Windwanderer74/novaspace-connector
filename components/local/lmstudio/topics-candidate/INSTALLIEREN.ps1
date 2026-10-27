# SPDX-License-Identifier: AGPL-3.0-or-later
param(
  [ValidateSet('Soul','ExampleUser')][string]$Konto = 'Soul',
  [switch]$NurPruefen
)
$ErrorActionPreference = 'Stop'
$pythonPath = Join-Path $env:LOCALAPPDATA 'NOVAFORGE\Programme\nextcloud-mcp-pilot\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Vorhandene Python-Umgebung fehlt.' }
$arguments = @((Join-Path $PSScriptRoot 'install_topics.py'), '--expected-user', $Konto)
if ($NurPruefen) { $arguments += '--check' }
& $pythonPath @arguments
if ($LASTEXITCODE -ne 0) { throw 'Installation nicht bestätigt. Meldung oben beachten; nicht blind wiederholen.' }
