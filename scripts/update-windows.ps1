# Atualizacao local do Moti.on no Windows — equivalente ao "Atualizar Moti.on.command".
# Chamado por "Atualizar Moti.on.cmd". Etapas:
#   1. dependencias npm (reinstala se node_modules veio de outro sistema, ex. do Mac)
#   2. build do painel (npm run build; compila o cofre da conta se houver Visual Studio)
#   3. motor nativo MotionCore.aex (se houver Visual Studio + SDK; senao avisa e segue)
#   4. painel instalado em modo desenvolvedor (licenca dispensada) e PlayerDebugMode

param(
  [switch]$SkipNative,
  # Instala sem o modo desenvolvedor, para testar o login Google / licenca real.
  [switch]$RealLicense
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $ProjectRoot

function Step($text) { Write-Host ""; Write-Host "== $text" -ForegroundColor Cyan }

Step "Verificando Node.js"
$Node = Get-Command node -ErrorAction SilentlyContinue
if (-not $Node) { throw "Node.js não encontrado. Instale o Node 22 LTS (nodejs.org) e abra este arquivo de novo." }
Write-Host "Node $(node --version)"

Step "Dependências"
$NativeEsbuild = Join-Path $ProjectRoot "node_modules\@esbuild\win32-x64"
if (-not (Test-Path $NativeEsbuild)) {
  Write-Host "node_modules ausente ou de outro sistema (Mac). Reinstalando com npm ci..."
  npm ci
  if ($LASTEXITCODE) { throw "npm ci falhou." }
}
else { Write-Host "node_modules ok." }

Step "Build do painel"
npm run build
if ($LASTEXITCODE) { throw "npm run build falhou." }

if (-not $SkipNative) {
  Step "Motor nativo (MotionCore.aex)"
  try {
    & (Join-Path $ProjectRoot "plugin\build-windows.ps1")
    & (Join-Path $ProjectRoot "plugin\install-dev.ps1")
  }
  catch {
    Write-Warning "Motor nativo não atualizado: $($_.Exception.Message)"
    Write-Warning "O painel funciona; só os efeitos nativos (Glitch/Wave/Transition/Gradient) ficam indisponíveis até isso ser resolvido."
  }
}

Step "Painel do After Effects"
if ($RealLicense) {
  & (Join-Path $ProjectRoot "scripts\install-ae-dev.ps1") -AllowUnsigned
}
else {
  & (Join-Path $ProjectRoot "scripts\install-ae-dev.ps1") -AllowUnsigned -DevUnlock
}

Write-Host ""
Write-Host "Instalação concluída. Reabra o After Effects." -ForegroundColor Green
