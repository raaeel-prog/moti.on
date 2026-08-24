#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$PROJECT_ROOT/dist/after-effects-cep"
TARGET_ROOT="$HOME/Library/Application Support/Adobe/CEP/extensions"
TARGET="$TARGET_ROOT/com.example.crosshosttoolkit.ae"

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
fi

echo "Extensão instalada em: $TARGET"
echo "Reinicie o After Effects e abra o painel CrossHost Toolkit."
