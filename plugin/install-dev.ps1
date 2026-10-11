# Instala o MotionCore.aex compilado no Windows (equivalente a install-dev.sh).
#
# Destino: pasta MediaCore comum da Adobe, que o After Effects carrega na
# inicializacao. Ela fica em Program Files, entao a copia pede permissao de
# administrador (o script se reabre elevado so para isso). A instalacao anterior
# e copiada para artifacts\install-backups. Preferencias e cache nao sao apagados.

param(
  [string]$Source = (Join-Path $PSScriptRoot "build-win\Release\MotionCore.aex"),
  [string]$BackupRoot = (Join-Path $PSScriptRoot "..\artifacts\install-backups")
)

$ErrorActionPreference = "Stop"
# No Windows a pasta comum fica em Program Files\Adobe\Common (o Plugin Loading.log
# do AE 26.5 so varre essa); "Common Files\Adobe\Common" nao e carregada.
$TargetRoot = Join-Path $env:ProgramFiles "Adobe\Common\Plug-ins\7.0\MediaCore"
$Target = Join-Path $TargetRoot "MotionCore.aex"
# Destino errado usado pela primeira versao deste script (2026-10-11).
$StaleTarget = Join-Path $env:CommonProgramFiles "Adobe\Common\Plug-ins\7.0\MediaCore\MotionCore.aex"

if (-not (Test-Path $Source)) {
  throw "MotionCore.aex não encontrado em $Source. Rode plugin\build-windows.ps1 antes."
}
$Source = (Resolve-Path $Source).Path

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $IsAdmin) {
  Write-Host "A pasta de plug-ins da Adobe exige administrador; o Windows vai pedir confirmação."
  New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
  $Arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"",
    "-Source", "`"$Source`"", "-BackupRoot", "`"$((Resolve-Path $BackupRoot).Path)`"")
  $Process = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList $Arguments
  if ($Process.ExitCode) { throw "Instalação do motor nativo não concluída (código $($Process.ExitCode))." }
  exit 0
}

if (Test-Path $Target) {
  $Backup = Join-Path $BackupRoot ("native-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Force -Path $Backup | Out-Null
  Copy-Item -Force $Target $Backup
  Write-Host "Backup: $Backup\MotionCore.aex"
}
New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
try {
  Copy-Item -Force $Source $Target
}
catch {
  throw "Não foi possível substituir $Target. Feche o After Effects e tente de novo."
}
if (Test-Path $StaleTarget) {
  Remove-Item -Force $StaleTarget
  Write-Host "Removida cópia antiga fora da pasta do AE: $StaleTarget"
}
Write-Host "Instalado: $Target"
Write-Host "Reinicie o After Effects para carregar o novo binário."
