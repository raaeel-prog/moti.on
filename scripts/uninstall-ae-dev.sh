#!/usr/bin/env bash
#
# Remove a instalacao de desenvolvimento do painel Moti.on.
#
# POR QUE ISTO EXISTE, e nao e conveniencia.
#
# A pasta de extensoes CEP nao pertence ao After Effects: e compartilhada por
# TODOS os hosts CEP instalados na maquina — Premiere Pro, Photoshop,
# Illustrator, InDesign. Cada um deles varre essa pasta na inicializacao.
#
# Em 2026-08-25, numa maquina Windows 11 com Premiere Pro 26.3.2.2, a presenca
# desta extensao na pasta compartilhada coincidiu com o Premiere nao concluir a
# inicializacao: travamento, queda e reinicio em ciclo, com "Application Hang"
# registrado pelo Windows. Removida a extensao, o Premiere abriu. O manifest
# declara AEFT como unico host e nenhum log CEPHtmlEngine*-PPRO-* do episodio
# existe, entao a falha acontece antes do carregamento do painel e o mecanismo
# continua NAO identificado.
#
# Outra abertura com a extensao presente funcionou, portanto a causa continua
# inconclusiva. Este script permite eliminar essa variavel rapidamente se um host
# Adobe voltar a apresentar problema de inicializacao.

set -euo pipefail

TARGET_ROOT="$HOME/Library/Application Support/Adobe/CEP/extensions"
TARGET="$TARGET_ROOT/com.motion.plugin.ae"

if [[ -d "$TARGET" ]]; then
  rm -rf "$TARGET"
  echo "Extensão removida de: $TARGET"
else
  echo "Nada a remover: $TARGET não existe."
fi

# Identificadores anteriores do projeto. Uma instalacao antiga esquecida na pasta
# compartilhada tem o mesmo efeito sobre os outros hosts que a atual.
for legacy in "com.example.crosshosttoolkit.ae"; do
  if [[ -d "$TARGET_ROOT/$legacy" ]]; then
    rm -rf "$TARGET_ROOT/$legacy"
    echo "Instalação anterior removida: $legacy"
  fi
done

if [[ "${1:-}" == "--disable-debug" ]]; then
  # PlayerDebugMode e uma chave global do CEP: desliga-la afeta qualquer outra
  # extensao nao assinada que o usuario dependa. Por isso e opt-in explicito.
  defaults delete com.adobe.CSXS.12 PlayerDebugMode 2>/dev/null || true
  echo "PlayerDebugMode removido de CSXS.12."
  echo "Aviso: outras extensões não assinadas nesta máquina podem deixar de carregar." >&2
fi

echo "Reinicie os aplicativos Adobe abertos para que a remoção tenha efeito."
