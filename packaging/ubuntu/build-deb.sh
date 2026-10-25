#!/bin/bash
# Explicit --build guard keeps preparation/preflight safe before the requested reboot.
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
"$repo/packaging/ubuntu/preflight.sh"
if [[ ${1:-} != --build ]]; then
 echo 'Stopped before building. After reboot, run this script with --build.'
 exit 0
fi
source /etc/os-release
jobs=${WALLABY_BUILD_JOBS:-1}
[[ $jobs =~ ^[1-9][0-9]*$ ]] || { echo 'WALLABY_BUILD_JOBS must be a positive integer.' >&2; exit 1; }
version=$(tr -d '\n\r ' < "$repo/VERSION")
package_version="${version}-0wallaby7~ubuntu${VERSION_ID}"
resolver_package=systemd-resolved
[[ $VERSION_ID != 22.04 ]] || resolver_package=systemd
build="$repo/build-ubuntu-${VERSION_ID}-amd64"
stage="$build/package"
args=()
if [[ -n ${WALLABY_DEPS_PREFIX:-} ]]; then
 prefix=$(realpath "$WALLABY_DEPS_PREFIX")
 export CMAKE_PREFIX_PATH="$prefix/usr${CMAKE_PREFIX_PATH:+:$CMAKE_PREFIX_PATH}"
 export PKG_CONFIG_PATH="$prefix/usr/lib/x86_64-linux-gnu/pkgconfig:$prefix/usr/share/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
 export LD_LIBRARY_PATH="$prefix/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
 args+=("-DCMAKE_PREFIX_PATH=$prefix/usr" "-DCMAKE_INCLUDE_PATH=$prefix/usr/include" "-DCMAKE_LIBRARY_PATH=$prefix/usr/lib/x86_64-linux-gnu")
 # Debian's SDL and other development headers also use architecture-specific includes.
 args+=("-DCMAKE_C_STANDARD_INCLUDE_DIRECTORIES=$prefix/usr/include;$prefix/usr/include/x86_64-linux-gnu"
        "-DCMAKE_CXX_STANDARD_INCLUDE_DIRECTORIES=$prefix/usr/include;$prefix/usr/include/x86_64-linux-gnu")
fi
cmake -S "$repo" -B "$build" -GNinja -DCMAKE_BUILD_TYPE=Release \
 -DCMAKE_INSTALL_PREFIX=/usr -DCMAKE_INSTALL_BINDIR=lib/wallaby-popcorn \
 -DCMAKE_INSTALL_LIBDIR=lib/x86_64-linux-gnu -DCMAKE_INSTALL_RPATH= \
 -DBUILD_TESTING=OFF -DCHECK_FOR_UPDATES=OFF -DUSE_STATIC_MPVQT=ON "${args[@]}"
cmake --build "$build" --target JellyfinDesktop --parallel "$jobs"
# Only the package staging directory is recreated; profiles and installations are never touched.
rm -rf -- "$stage"
DESTDIR="$stage" cmake --install "$build"
install -Dm755 "$repo/packaging/ubuntu/wallaby-popcorn" "$stage/usr/bin/wallaby-popcorn"
install -Dm755 "$repo/packaging/ubuntu/migrate-flatpak-data.py" "$stage/usr/share/wallaby-popcorn/migrate-flatpak-data.py"
install -Dm755 "$repo/packaging/ubuntu/ipv6-launcher.py" "$stage/usr/share/wallaby-popcorn/ipv6-launcher.py"
install -Dm644 "$repo/LICENSE" "$stage/usr/share/doc/wallaby-popcorn/copyright"
install -Dm644 "$repo/README-WALLABY.md" "$stage/usr/share/doc/wallaby-popcorn/README.md"
for license in "$repo"/external/mpvqt/LICENSES/*; do
 install -Dm644 "$license" "$stage/usr/share/doc/wallaby-popcorn/licenses/mpvqt/$(basename "$license")"
done
binary="$stage/usr/lib/wallaby-popcorn/wallaby-popcorn"
strip --strip-unneeded "$binary"
mkdir -p "$stage/DEBIAN" "$repo/dist"
cd "$repo"
shlib_args=(-O "-e$binary")
if [[ -n ${prefix:-} ]]; then shlib_args+=("-l$prefix/usr/lib/x86_64-linux-gnu" "-L$prefix/shlibs.local"); fi
shlibs=$(dpkg-shlibdeps "${shlib_args[@]}" | sed -n 's/^shlibs:Depends=//p')
[[ -n $shlibs ]] || { echo 'Could not calculate runtime library dependencies.' >&2; exit 1; }
cat > "$stage/DEBIAN/control" <<CONTROL
Package: wallaby-popcorn
Version: $package_version
Architecture: amd64
Maintainer: Wallaby Suite <bluesilent9@users.noreply.github.com>
Section: video
Priority: optional
Homepage: https://github.com/bluesilent9/wallaby-popcorn-desktop
Depends: $shlibs, openssh-client, python3, libseccomp2, $resolver_package, qml6-module-qtquick, qml6-module-qtwebengine, qml6-module-qtwebchannel, qml6-module-qtquick-controls, qml6-module-qtquick-window, qml6-module-qtqml-workerscript, qml6-module-qtquick-templates
Recommends: qt6-wayland
Installed-Size: $(du -sk "$stage/usr" | cut -f1)
Description: Wallaby Popcorn desktop media client with built-in SSH tunnelling
 Independent Jellyfin Desktop fork with Wallaby branding, a cinema library view
 and in-app access to the existing administrator dashboard.
 Built for Ubuntu $VERSION_ID amd64. Rebuild on other supported Ubuntu releases.
CONTROL
output="$repo/dist/wallaby-popcorn_${package_version}_amd64.deb"
dpkg-deb --root-owner-group -Zxz --build "$stage" "$output"
dpkg-deb --info "$output"
sha256sum "$output" > "$output.sha256"
printf 'Built %s\n' "$output"
