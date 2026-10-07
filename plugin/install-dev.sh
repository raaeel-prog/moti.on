#!/usr/bin/env bash
set -euo pipefail
PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="${1:-$PLUGIN_ROOT/build-native/MotionCore.plugin}"
INSTALL_USER_HOME="${MOTION_USER_HOME:-$HOME}"
USER_ROOT="$INSTALL_USER_HOME/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore"
SYSTEM_ROOT="/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore"
if [[ -d "$USER_ROOT/MotionCore.plugin" && -d "$SYSTEM_ROOT/MotionCore.plugin" ]]; then
  echo 'Duplicate MotionCore installations detected. Back up and reconcile before updating.' >&2
  exit 1
fi
TARGET_ROOT="$USER_ROOT"
# Update the existing installation; never create a second copy in another scope.
if [[ -d "$SYSTEM_ROOT/MotionCore.plugin" ]]; then TARGET_ROOT="$SYSTEM_ROOT"; fi
TARGET="$TARGET_ROOT/MotionCore.plugin"
bash "$PLUGIN_ROOT/verify-bundle.sh" "$SOURCE"
if [[ -d "$TARGET" && ( ! -w "$TARGET/Contents/MacOS/MotionCore" || ! -w "$TARGET/Contents/MacOS" || ! -w "$TARGET/Contents/Resources" || ! -w "$TARGET/Contents" || ! -w "$TARGET/Contents/_CodeSignature" ) ]]; then
  echo 'A instalação existente exige autenticação administrativa. Abra Atualizar Moti.on.command.' >&2
  exit 1
fi
BACKUP="$PLUGIN_ROOT/../artifacts/install-backups/native-$(date +%Y%m%d-%H%M%S)"
if [[ -d "$TARGET" ]]; then
  mkdir -p "$BACKUP"
  ditto "$TARGET" "$BACKUP/MotionCore.plugin"
  echo "Backup: $BACKUP/MotionCore.plugin"
fi
mkdir -p "$TARGET_ROOT"
ditto "$SOURCE" "$TARGET"
bash "$PLUGIN_ROOT/verify-bundle.sh" "$TARGET"
echo "Installed: $TARGET"
echo 'Restart After Effects to load the new binary. No preferences/cache were removed.'
