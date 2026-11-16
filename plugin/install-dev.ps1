# Instala os plug-ins nativos compilados no Windows (equivalente a install-dev.sh):
#   MotionCore.aex          — efeitos Glitch Core, Wave Core, Native Transition, Gradient
#   MotionGestureBridge.aex — AEGP Live Gestures: barra rápida na timeline e arraste nativo
#
# Destino: pasta MediaCore comum da Adobe, que o After Effects carrega na
# inicializacao. Ela fica em Program Files, entao a copia pede permissao de
# administrador (o script se reabre elevado so para isso). A instalacao anterior
# e copiada para artifacts\install-backups. Preferencias e cache nao sao apagados.

param(
  [string]$BuildDir = (Join-Path $PSScriptRoot "build-win\Release"),
  [string]$BackupRoot = (Join-Path $PSScriptRoot "..\artifacts\install-backups")
)

$ErrorActionPreference = "Stop"
# No Windows a pasta comum fica em Program Files\Adobe\Common (o Plugin Loading.log
# do AE 26.5 so varre essa); "Common Files\Adobe\Common" nao e carregada.
$TargetRoot = Join-Path $env:ProgramFiles "Adobe\Common\Plug-ins\7.0\MediaCore"
# Destino errado usado pela primeira versao deste script (2026-10-11).
$StaleRoot = Join-Path $env:CommonProgramFiles "Adobe\Common\Plug-ins\7.0\MediaCore"
$Plugins = @("MotionCore.aex", "MotionGestureBridge.aex")

if (-not (Test-Path (Join-Path $BuildDir "MotionCore.aex"))) {
  throw "MotionCore.aex não encontrado em $BuildDir. Rode plugin\build-windows.ps1 antes."
}
$BuildDir = (Resolve-Path $BuildDir).Path

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) {
  Write-Host "A pasta de plug-ins da Adobe exige administrador; o Windows vai pedir confirmação."
  New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
  $Arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"",
    "-BuildDir", "`"$BuildDir`"", "-BackupRoot", "`"$((Resolve-Path $BackupRoot).Path)`"")
  $Process = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList $Arguments
  if ($Process.ExitCode) { throw "Instalação do motor nativo não concluída (código $($Process.ExitCode))." }
  exit 0
}

New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
$Backup = Join-Path $BackupRoot ("native-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
foreach ($Name in $Plugins) {
  $Source = Join-Path $BuildDir $Name
  $Target = Join-Path $TargetRoot $Name
  if (-not (Test-Path $Source)) {
    Write-Warning "$Name não foi compilado; a versão instalada (se houver) foi mantida."
    continue
  }
  if (Test-Path $Target) {
    New-Item -ItemType Directory -Force -Path $Backup | Out-Null
    Copy-Item -Force $Target $Backup
    Write-Host "Backup: $Backup\$Name"
  }
  try {
    Copy-Item -Force $Source $Target
  }
  catch {
    throw "Não foi possível substituir $Target. Feche o After Effects e tente de novo."
  }
  $Stale = Join-Path $StaleRoot $Name
  if (Test-Path $Stale) {
    Remove-Item -Force $Stale
    Write-Host "Removida cópia antiga fora da pasta do AE: $Stale"
  }
  Write-Host "Instalado: $Target"
}
# Rodizio: guarda so os 3 backups mais recentes dos binarios nativos.
Get-ChildItem -Directory $BackupRoot -Filter "native-*" -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -Skip 3 |
  ForEach-Object { Remove-Item -Recurse -Force $_.FullName }
Write-Host "Reinicie o After Effects para carregar os novos binários."
