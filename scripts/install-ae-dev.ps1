param(
  [switch]$EnableDebugMode
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Source = Join-Path $ProjectRoot "dist\after-effects-cep"
$TargetRoot = Join-Path $env:APPDATA "Adobe\CEP\extensions"
$Target = Join-Path $TargetRoot "com.motion.plugin.ae"

if (-not (Test-Path $Source)) {
  throw "Build não encontrado. Execute 'npm run build' antes da instalação."
}

New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
if (Test-Path $Target) {
  Remove-Item -Recurse -Force $Target
}
Copy-Item -Recurse -Force $Source $Target

if ($EnableDebugMode) {
  $RegistryPath = "HKCU:\Software\Adobe\CSXS.12"
  New-Item -Force -Path $RegistryPath | Out-Null
  New-ItemProperty -Path $RegistryPath -Name "PlayerDebugMode" -PropertyType String -Value "1" -Force | Out-Null
  Write-Host "PlayerDebugMode habilitado para CSXS.12."
}

Write-Host "Extensão instalada em: $Target"
Write-Host "Reinicie o After Effects e abra o painel Moti.on."
