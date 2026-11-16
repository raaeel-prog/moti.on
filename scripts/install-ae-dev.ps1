# Instala o painel Moti.on para desenvolvimento no After Effects.
#
# ATENCAO: o destino NAO e uma pasta do After Effects.
# `%APPDATA%\Adobe\CEP\extensions` e compartilhada por todos os hosts CEP da
# maquina — Premiere Pro, Photoshop, Illustrator, InDesign —, e cada um a varre
# na inicializacao. Em 2026-08-25, nesta maquina (Premiere Pro 26.3.2.2 /
# Windows 11), a presenca desta extensao coincidiu uma vez com o Premiere nao
# concluir a inicializacao, mas outra abertura com ela instalada funcionou. A
# causa continua NAO identificada; ver docs/HOST_LIMITATIONS.md.
# Se o Premiere voltar a falhar na abertura, use `scripts/uninstall-ae-dev.ps1`
# para eliminar rapidamente essa variavel.

param(
  [switch]$EnableDebugMode,
  # Modo desenvolvedor: dispensa a licenca so nesta instalacao local (mesmo
  # arquivo account/developer-unlock do install-ae-dev.sh). Sem a flag ele e
  # removido, para testar o login real.
  [switch]$DevUnlock,
  # Liga so o PlayerDebugMode (necessario para carregar a extensao nao
  # assinada), sem instalar o .debug do inspetor remoto.
  [switch]$AllowUnsigned
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Source = Join-Path $ProjectRoot "dist\after-effects-cep"
$TargetRoot = Join-Path $env:APPDATA "Adobe\CEP\extensions"
$Target = Join-Path $TargetRoot "com.motion.plugin.ae"
$MaxBackups = 3

if (-not (Test-Path $Source)) {
  throw "Build não encontrado. Execute 'npm run build' antes da instalação."
}

New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
if (Test-Path $Target) {
  # Atualizacao reversivel: a instalacao anterior vai para artifacts/install-backups.
  $Backup = Join-Path $ProjectRoot ("artifacts\install-backups\ae-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Force -Path $Backup | Out-Null
  Copy-Item -Recurse -Force $Target (Join-Path $Backup "previous")
  Write-Host "Backup da instalação anterior: $Backup\previous"
  Remove-Item -Recurse -Force $Target
  # Rodizio: guarda so os 3 backups mais recentes da extensao.
  Get-ChildItem -Directory (Split-Path $Backup) -Filter "ae-*" |
    Sort-Object Name -Descending | Select-Object -Skip $MaxBackups |
    ForEach-Object { Remove-Item -Recurse -Force $_.FullName }
}
Copy-Item -Recurse -Force $Source $Target

$UnlockFile = Join-Path $Target "account\developer-unlock"
if ($DevUnlock) {
  New-Item -ItemType Directory -Force -Path (Split-Path $UnlockFile) | Out-Null
  Set-Content -Path $UnlockFile -Value "Instalação de desenvolvimento: licença dispensada." -Encoding UTF8
  Write-Host "Modo desenvolvedor ativo: o plugin funciona sem licença nesta máquina."
}
elseif (Test-Path $UnlockFile) {
  Remove-Item -Force $UnlockFile
}

if ($AllowUnsigned -and -not $EnableDebugMode) {
  $RegistryPath = "HKCU:\Software\Adobe\CSXS.12"
  New-Item -Force -Path $RegistryPath | Out-Null
  New-ItemProperty -Path $RegistryPath -Name "PlayerDebugMode" -PropertyType String -Value "1" -Force | Out-Null
  Write-Host "PlayerDebugMode habilitado para CSXS.12 (extensão de desenvolvimento não assinada)."
}

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
Write-Warning ("Esta pasta e compartilhada com Premiere Pro, Photoshop e demais hosts CEP. " +
  "Se um host apresentar problema de inicializacao, rode scripts/uninstall-ae-dev.ps1 " +
  "para eliminar a extensao como variavel de diagnostico.")
