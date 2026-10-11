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
# A development update is reversible and never touches another extension.
BACKUP="$PROJECT_ROOT/artifacts/install-backups/ae-$(date +%Y%m%d-%H%M%S)"
if [[ -d "$TARGET" ]]; then
  mkdir -p "$BACKUP"
  cp -R "$TARGET" "$BACKUP/previous"
  echo "Backup da instalação anterior: $BACKUP/previous"
fi
mkdir -p "$TARGET"
rsync -a "$SOURCE/" "$TARGET/"

# Modo desenvolvedor: dispensa a licenca so nesta instalacao local. Sem a flag,
# o arquivo e removido, para testar o login real com a mesma pasta.
DEV_UNLOCK=0; DEBUG=0
for ARG in "$@"; do
  case "$ARG" in
    --dev-unlock) DEV_UNLOCK=1 ;;
    --enable-debug) DEBUG=1 ;;
  esac
done
if [[ "$DEV_UNLOCK" == 1 ]]; then
  mkdir -p "$TARGET/account"
  echo "Instalação de desenvolvimento: licença dispensada." > "$TARGET/account/developer-unlock"
  echo "Modo desenvolvedor ativo: o plugin funciona sem licença nesta máquina."
else
  rm -f "$TARGET/account/developer-unlock"
fi

if [[ "$DEBUG" == 1 ]]; then
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
