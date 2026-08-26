# Remove a instalacao de desenvolvimento do painel Moti.on.
#
# POR QUE ISTO EXISTE, e nao e conveniencia.
#
# `%APPDATA%\Adobe\CEP\extensions` nao pertence ao After Effects: e compartilhada
# por TODOS os hosts CEP instalados na maquina — Premiere Pro, Photoshop,
# Illustrator, InDesign. Cada um deles varre essa pasta na inicializacao.
#
# Em 2026-08-25, nesta maquina (Premiere Pro 26.3.2.2, Windows 11), com a
# extensao presente nessa pasta o Premiere nao concluiu a inicializacao: travou,
# caiu e reiniciou em ciclo, e o Windows registrou "Application Hang". Removida a
# extensao, o Premiere abriu. O manifest declara `AEFT` como unico host e o
# Premiere nunca chegou a criar um renderer CEP para ela — nao existe log
# `CEPHtmlEngine*-PPRO-*` do episodio —, entao a falha acontece antes do
# carregamento do painel, e o mecanismo continua NAO identificado.
#
# Outra abertura com a extensao presente funcionou, portanto a causa continua
# inconclusiva. Este script permite eliminar essa variavel rapidamente se um host
# Adobe voltar a apresentar problema de inicializacao.

param(
  [switch]$DisableDebugMode
)

$ErrorActionPreference = "Stop"

$TargetRoot = Join-Path $env:APPDATA "Adobe\CEP\extensions"
$Target = Join-Path $TargetRoot "com.motion.plugin.ae"

if (Test-Path $Target) {
  Remove-Item -Recurse -Force $Target
  Write-Host "Extensão removida de: $Target"
}
else {
  Write-Host "Nada a remover: $Target não existe."
}

# Identificadores anteriores do projeto. Uma instalacao antiga esquecida na pasta
# compartilhada tem o mesmo efeito sobre os outros hosts que a atual.
$Legacy = @("com.example.crosshosttoolkit.ae")
foreach ($name in $Legacy) {
  $path = Join-Path $TargetRoot $name
  if (Test-Path $path) {
    Remove-Item -Recurse -Force $path
    Write-Host "Instalação anterior removida: $name"
  }
}

if ($DisableDebugMode) {
  # PlayerDebugMode e uma chave global do CEP: desliga-la afeta qualquer outra
  # extensao nao assinada que o usuario dependa. Por isso e opt-in explicito, e
  # nao parte da desinstalacao padrao.
  $RegistryPath = "HKCU:\Software\Adobe\CSXS.12"
  if (Test-Path $RegistryPath) {
    Remove-ItemProperty -Path $RegistryPath -Name "PlayerDebugMode" -ErrorAction SilentlyContinue
    Write-Host "PlayerDebugMode removido de CSXS.12."
    Write-Warning "Outras extensões não assinadas nesta máquina podem deixar de carregar."
  }
}

Write-Host "Reinicie os aplicativos Adobe abertos para que a remoção tenha efeito."
