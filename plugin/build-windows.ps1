# Compila o motor nativo (MotionCore.aex) no Windows.
#
# Requisitos: Visual Studio 2022+ ou Build Tools com "Desenvolvimento para
# desktop com C++" (traz cl.exe e CMake) e o SDK oficial do After Effects para
# Windows. Por padrao o SDK e procurado ao lado da pasta do projeto
# (..\..\AfterEffectsSDK_26.5_win); defina AESDK_ROOT para outro caminho.
#
# Saida: plugin\build-win\Release\MotionCore.aex. Gradient roda na CPU no
# Windows (o caminho de GPU e Metal, so macOS).

param(
  [string]$AeSdkRoot = $env:AESDK_ROOT,
  [string]$BuildDir = (Join-Path $PSScriptRoot "build-win"),
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

if (-not $AeSdkRoot) {
  foreach ($candidate in @(
      (Join-Path $PSScriptRoot "..\..\AfterEffectsSDK_26.5_win"),
      (Join-Path $PSScriptRoot "..\..\..\AfterEffectsSDK_26.5_win"))) {
    if (Test-Path (Join-Path $candidate "Examples\Headers\AE_Effect.h")) { $AeSdkRoot = (Resolve-Path $candidate).Path; break }
  }
}
if (-not $AeSdkRoot -or -not (Test-Path (Join-Path $AeSdkRoot "Examples\Headers\AE_Effect.h"))) {
  throw "SDK do After Effects para Windows não encontrado. Defina AESDK_ROOT (pasta que contém Examples\Headers)."
}

$VsWhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $VsWhere)) {
  throw "Visual Studio não encontrado. Instale o Visual Studio Build Tools com 'Desenvolvimento para desktop com C++'."
}
$VsPath = & $VsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $VsPath) {
  throw "Visual Studio sem as ferramentas C++ (MSVC x64). Adicione a carga 'Desenvolvimento para desktop com C++'."
}

$Cmake = (Get-Command cmake -ErrorAction SilentlyContinue).Source
$VsCmake = Join-Path $VsPath "Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
if (Test-Path $VsCmake) { $Cmake = $VsCmake }
if (-not $Cmake) { throw "CMake não encontrado (vem com o componente 'C++ CMake tools for Windows' do Visual Studio)." }
$Ctest = Join-Path (Split-Path $Cmake) "ctest.exe"

Write-Host "SDK:    $AeSdkRoot"
Write-Host "VS:     $VsPath"
Write-Host "CMake:  $Cmake"

& $Cmake -S $PSScriptRoot -B $BuildDir -A x64 "-DAESDK_ROOT=$AeSdkRoot"
if ($LASTEXITCODE) { throw "Falha ao configurar o CMake." }
& $Cmake --build $BuildDir --config Release --parallel
if ($LASTEXITCODE) { throw "Falha na compilação do MotionCore." }
if (-not $SkipTests) {
  & $Ctest --test-dir $BuildDir -C Release --output-on-failure
  if ($LASTEXITCODE) { throw "Testes dos kernels falharam." }
}

$Output = Join-Path $BuildDir "Release\MotionCore.aex"
if (-not (Test-Path $Output)) { throw "MotionCore.aex não foi gerado em $Output." }
Write-Host "Plug-in de desenvolvimento: $Output"
