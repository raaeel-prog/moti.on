#!/usr/bin/env bash
set -euo pipefail
PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${MOTION_BUILD_DIR:-$PLUGIN_ROOT/build-native}"
if [[ -z "${AESDK_ROOT:-}" ]]; then
  echo 'Define AESDK_ROOT com o caminho do SDK oficial do After Effects.' >&2
  exit 1
fi
if [[ -n "${CMAKE:-}" ]]; then
  CMAKE_BIN="$CMAKE"
elif command -v cmake >/dev/null 2>&1; then
  CMAKE_BIN="$(command -v cmake)"
else
  CMAKE_BIN="$PLUGIN_ROOT/cmake-3.29.3-macos-universal/CMake.app/Contents/bin/cmake"
fi
"$CMAKE_BIN" -S "$PLUGIN_ROOT" -B "$BUILD_DIR" -G 'Unix Makefiles' \
  -DAESDK_ROOT="$AESDK_ROOT" -DCMAKE_BUILD_TYPE=RelWithDebInfo "$@"
"$CMAKE_BIN" --build "$BUILD_DIR" --parallel 4
"$(dirname "$CMAKE_BIN")/ctest" --test-dir "$BUILD_DIR" --output-on-failure
echo "Bundle de desenvolvimento: $BUILD_DIR/MotionCore.plugin"
