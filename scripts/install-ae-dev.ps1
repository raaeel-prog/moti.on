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

  # PlayerDebugMode so permite carregar extensao nao assinada. Quem abre o
  # inspetor remoto e o arquivo .debug, que declara a porta — e ele e excluido
  # de dist/ de proposito, para nunca viajar num pacote distribuivel. A copia
  # acontece aqui, sob esta flag, que e o unico lugar onde o repositorio sabe
  # que a instalacao e de desenvolvimento.
  $DebugSource = Join-Path $ProjectRoot "apps\after-effects-cep\.debug"
  if (Test-Path $DebugSource) {
    Copy-Item -Force $DebugSource (Join-Path $Target ".debug")
    Write-Host "Inspetor remoto habilitado em http://127.0.0.1:8091 (arquivo .debug instalado)."
  }
  else {
    Write-Warning "Arquivo .debug nao encontrado em $DebugSource; o inspetor remoto ficara indisponivel."
  }
}

Write-Host "Extensão instalada em: $Target"
Write-Host "Reinicie o After Effects e abra o painel Moti.on."
