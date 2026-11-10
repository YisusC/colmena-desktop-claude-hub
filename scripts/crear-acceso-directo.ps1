# Creates a "Colmena" shortcut in the Start menu that opens the built app.
# Usage: powershell -File scripts/crear-acceso-directo.ps1 [-Escritorio]
param([switch]$Escritorio)

$root = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electron)) { throw "No encuentro $electron. Corre 'npm install' primero." }
if (-not (Test-Path (Join-Path $root 'out\main\index.js'))) { throw "Falta la compilación. Corre 'npm run build' primero." }

$destinos = @([Environment]::GetFolderPath('Programs'))
if ($Escritorio) { $destinos += [Environment]::GetFolderPath('Desktop') }

$shell = New-Object -ComObject WScript.Shell
foreach ($dir in $destinos) {
  $lnk = $shell.CreateShortcut((Join-Path $dir 'Colmena.lnk'))
  $lnk.TargetPath = $electron
  $lnk.Arguments = "`"$root`""
  $lnk.WorkingDirectory = $root
  $lnk.Description = 'Colmena: tus sesiones de Claude Code organizadas'
  $lnk.Save()
  Write-Output "Acceso directo creado en $dir"
}
