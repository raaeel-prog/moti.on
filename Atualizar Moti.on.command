#!/bin/bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"
echo 'Atualização local do Moti.on — motor C++ e painel'
echo 'Feche o After Effects antes de continuar. A instalação atual será copiada para artifacts/install-backups.'
read -r -p 'Pressione Return para continuar: ' REPLY
if [[ -d '/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore/MotionCore.plugin' ]]; then
  sudo /usr/bin/env MOTION_USER_HOME="$HOME" /bin/bash plugin/install-dev.sh
else
  /bin/bash plugin/install-dev.sh
fi
/bin/bash scripts/install-ae-dev.sh
printf '\nInstalação concluída. Reabra o After Effects.\n'
read -r -p 'Pressione Return para fechar: ' REPLY
