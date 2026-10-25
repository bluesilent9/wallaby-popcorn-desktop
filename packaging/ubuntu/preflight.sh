#!/bin/bash
set -euo pipefail
source /etc/os-release
case "${ID}:${VERSION_ID}:$(dpkg --print-architecture)" in
 ubuntu:22.04:amd64|ubuntu:24.04:amd64|ubuntu:26.04:amd64|ubuntu:26.10:amd64) ;;
 *) echo 'Use an amd64 Ubuntu 22.04, 24.04, 26.04 or 26.10 build environment.' >&2; exit 1;;
esac
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
for command in cmake ninja g++ python3 pkg-config dpkg-deb dpkg-shlibdeps strip; do
 command -v "$command" >/dev/null || { echo "Missing build tool: $command" >&2; exit 1; }
done
[[ -f "$repo/external/mpvqt/src/mpvabstractitem.cpp" ]] || { echo 'Initialize the pinned mpvqt submodule first.' >&2; exit 1; }
prefix=${WALLABY_DEPS_PREFIX:-/usr}
if [[ $prefix != /usr ]]; then
 [[ -f "$prefix/shlibs.local" ]] || { echo 'The isolated dependency prefix has not been prepared.' >&2; exit 1; }
 prefix="$prefix/usr"
fi
for path in lib/x86_64-linux-gnu/cmake/Qt6WebEngineQuick/Qt6WebEngineQuickConfig.cmake include/x86_64-linux-gnu/qt6/QtCore/qobject.h include/mpv/client.h lib/qt6/libexec/moc; do
 [[ -e "$prefix/$path" ]] || { echo "Missing development dependency: $prefix/$path" >&2; exit 1; }
done
printf 'Preflight passed: Ubuntu %s amd64; source and dependency files available. No CMake configuration, compilation or packaging run.\n' "$VERSION_ID"
