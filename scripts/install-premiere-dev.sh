#!/usr/bin/env bash
# Instalação local de desenvolvimento; não é um pacote de release assinado.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Este instalador é exclusivo do macOS. Consulte docs/INSTALLATION.md para Windows." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$PROJECT_ROOT/dist/premiere-uxp"
UPIA="/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent"

if [[ ! -x "$UPIA" ]]; then
  echo "Instalador Adobe não encontrado. Instale/abra o Creative Cloud Desktop e o Premiere primeiro." >&2
  exit 1
fi
if [[ ! -f "$SOURCE/manifest.json" ]]; then
  echo "Build não encontrado. Execute npm run build antes da instalação." >&2
  exit 1
fi

# Valida os dois artefatos e suas permissões antes de chamar o instalador Adobe.
node "$SCRIPT_DIR/validate.mjs"

STAGING="$(mktemp -d "${TMPDIR:-/tmp}/motion-premiere-dev.XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT
PACKAGE="$STAGING/motion-dev.ccx"

# Sem pasta externa nem metadados Apple: manifest.json precisa estar na raiz.
/usr/bin/ditto -c -k --norsrc "$SOURCE" "$PACKAGE"
"$UPIA" --install "$PACKAGE"
"$UPIA" --list "Premiere Pro"
echo "Instalação de desenvolvimento concluída. Reabra o Premiere e use Janela > Plug-ins UXP > Moti.on."
echo "O registro não comprova o carregamento do painel: execute o roteiro em docs/INSTALLATION.md."
