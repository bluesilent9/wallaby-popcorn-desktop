# Ubuntu amd64 preparation and build

The intended source targets are standard-support Ubuntu **22.04, 24.04, 26.04 and 26.10**, including Kubuntu. Build a separate DEB in the matching Ubuntu release environment: native Qt, libmpv and glibc dependencies vary. This does not promise that a DEB built on 26.04 runs on older releases. Only the **26.04 LTS amd64** DEB is authorized for the first build after the reboot. Other release builds are deferred.

The code retains upstream's Qt 6 and older-Qt compatibility paths. MpvQt is built from the pinned submodule so older releases do not need a separately packaged libmpvqt. Cross-release builds/runtime tests have **not** been performed; compatibility is an intended source target, not a verified binary matrix.

## Standard system dependencies

Run these on the target build environment, when build preparation is desired:

```sh
sudo apt-get install build-essential cmake ninja-build pkg-config python3 dpkg-dev \
  qt6-base-dev qt6-base-private-dev qt6-declarative-dev qt6-webengine-dev \
  qt6-wayland-dev libmpv-dev libcec-dev libsdl2-dev libminizip-dev libxrandr-dev libgl-dev libegl-dev

git submodule update --init --recursive
packaging/ubuntu/preflight.sh
```

On the current laptop the dependencies have instead been downloaded and extracted **without installing system packages**, under a workspace prefix. `prepare-deps.py ARCHIVES NEW_PREFIX` extracts Ubuntu's .deb files and fills missing paths with read-only references to the current host. It refuses to extract again over such an overlay. This prefix is specific to the current host/release, is outside the source repository, and must never be shipped in the runtime DEB.

For this prepared checkout:

```sh
export WALLABY_DEPS_PREFIX=/home/dave/Documents/Codex/2026-10-24/i/work/desktop-deps/prefix-26.04
packaging/ubuntu/preflight.sh
# STOP here until reboot and explicit build authorization.
packaging/ubuntu/build-deb.sh --build
```

The guarded build script defaults to one job, configures CMake only after `--build`, embeds the native web assets, stages the app under `/usr/lib/wallaby-popcorn`, adds a launcher under `/usr/bin`, calculates ELF library dependencies with `dpkg-shlibdeps` and creates one release-specific DEB and SHA256 file under `dist/`. QtWebEngine, QML modules, OpenSSH and Python are runtime distribution dependencies, not a bundled SDK.

An alternative conventional `dpkg-buildpackage` recipe lives under `debian/`; the guarded script is the intended first build path. Keep the upstream `VERSION` (currently 2.0.0), with a distinct Debian package revision for downstream changes.

## Validation after the first build

Before calling the DEB usable: inspect package contents/dependencies and ensure no dependency-prefix RPATH is shipped; install on the intended 26.04 machine; verify Flatpak data import without exposing/removing keys or tokens; connect to the IPv6 SSH server; test playback, normal shutdown and tunnel cleanup; test an admin dashboard and a non-admin account; test native filters/sorting, empty results, view switching, scrolling beyond 100 titles, technical metadata and navigation back from details. The browser fixture and source checks cannot establish those runtime results.

## Sources for compatibility decisions

- [Ubuntu release lifecycle](https://ubuntu.com/about/release-cycle)
- [Qt 6.10 supported Linux configurations](https://doc.qt.io/qt-6.10/linux.html)
- [Ubuntu 22.04 Qt6 WebEngine development package](https://packages.ubuntu.com/jammy/qt6-webengine-dev)
- Upstream `CMakeModules/QtConfiguration.cmake` and `external/qt-wayland-compat.h`

## Next development correction

See [the IPv6 and cinema-view handover](ipv6-and-library-fix.md). The next DEB revision is `0wallaby2`; its source is prepared but must not be built before another reboot/authorization. It requires a matching one-key server forwarding migration when switching from the old desktop DEB. The Ubuntu launcher now requires libseccomp2 and uses the OS IPv6 resolver; direct IPv4 connections are disabled.

## Next prepared revision

See [desktop library polish](library-visual-polish.md). The next package is `2.0.0-0wallaby3~ubuntu26.04`, with source and browser-preview checks only. Stop before building until Dave reboots and authorizes it. GitHub Actions remain disabled.
