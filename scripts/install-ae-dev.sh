#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$PROJECT_ROOT/dist/after-effects-cep"
TARGET_ROOT="$HOME/Library/Application Support/Adobe/CEP/extensions"
TARGET="$TARGET_ROOT/com.motion.plugin.ae"

if [[ ! -d "$SOURCE" ]]; then
  echo "Build não encontrado. Execute 'npm run build' antes da instalação." >&2
  exit 1
fi

mkdir -p "$TARGET_ROOT"
rm -rf "$TARGET"
cp -R "$SOURCE" "$TARGET"

if [[ "${1:-}" == "--enable-debug" ]]; then
  defaults write com.adobe.CSXS.12 PlayerDebugMode 1
  echo "PlayerDebugMode habilitado para CSXS.12."

  # PlayerDebugMode so permite carregar extensao nao assinada. Quem abre o
  # inspetor remoto e o arquivo .debug, que declara a porta — e ele e excluido
  # de dist/ de proposito, para nunca viajar num pacote distribuivel. A copia
  # acontece aqui, sob esta flag, que e o unico lugar onde o repositorio sabe
  # que a instalacao e de desenvolvimento.
  DEBUG_SOURCE="$PROJECT_ROOT/apps/after-effects-cep/.debug"
  if [[ -f "$DEBUG_SOURCE" ]]; then
    cp -f "$DEBUG_SOURCE" "$TARGET/.debug"
    echo "Inspetor remoto habilitado em http://127.0.0.1:8091 (arquivo .debug instalado)."
  else
    echo "Aviso: .debug não encontrado em $DEBUG_SOURCE; o inspetor remoto ficará indisponível." >&2
  fi
fi

echo "Extensão instalada em: $TARGET"
echo "Reinicie o After Effects e abra o painel Moti.on."
