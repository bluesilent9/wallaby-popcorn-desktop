# Wallaby Popcorn Desktop — Development

Wallaby Popcorn is an independent fork of [Jellyfin Desktop](https://github.com/jellyfin/jellyfin-desktop), based on **v2.0.0** (`1634d3d263b881dccc62bf278d1289b471ec7af1`). The upstream history, GPL license and version number are retained. Ubuntu package revisions identify the Wallaby changes separately. Upstream feature updates are merged manually when requested.

The separate [Android fork](https://github.com/bluesilent9/wallaby-popcorn) follows Jellyfin's separate Android repository. This repository contains the desktop client; current work targets Ubuntu/Kubuntu amd64 only and belongs on **Development**. No desktop stable release has been published.

## Changes

- Existing working `ssh://user@host:port` integration retained from the earlier Kubuntu Flatpak. OpenSSH resolves IPv6 hostnames, pins the host key after explicit fingerprint confirmation, owns its tunnel process, and forwards only to the server's loopback Jellyfin port. Existing installed server enrollment helpers are reused. No Wallaby Agent service is needed for this app's tunnel.
- Wallaby Popcorn app identity, launcher/window icons and the app-owned connection screen retain their artwork. The server's own logos, theme, Home page, libraries, menus, artwork, pagination and navigation are displayed without Wallaby client-side overrides.
- Existing native media-player integration, IPv6-only networking and same-origin dashboard link routing remain. The client does not add dashboard buttons or change server permissions.
- First launch of the DEB copies existing Flatpak profiles, WebEngine sessions and app-owned SSH identities/pins into the new per-user data directory, when no new profile directory exists. The old Flatpak must be closed; its original data is preserved. No private user data is included in this source repository.

## Prepare and build

See [Ubuntu packaging](docs/ubuntu-build.md). **No compilation is part of preflight.** Run `packaging/ubuntu/build-deb.sh --build` only after the requested reboot/build authorization. The default is one compiler job. Only Ubuntu **26.04 LTS amd64** is the initial build target.

See [restoration details](docs/server-interface-restoration.md). The old [previews](previews/README.md) are historical design references for later server-side work and are not the current desktop interface.

## Upstream and licenses

Retain `upstream` pointing to Jellyfin Desktop and merge deliberately into Development. Keep `VERSION` aligned with the chosen Jellyfin Desktop release. A package named `2.0.0-0wallaby1~ubuntu26.04` still reports upstream app version 2.0.0. Do not install an official Jellyfin update over this fork automatically.

The application retains its upstream GPL-2.0 license. Bundled MpvQt is an unmodified, pinned submodule under its own LGPL terms; its sources and license texts are retained and included in source distribution. See `LICENSE`, `debian/copyright` and `external/mpvqt/LICENSES/`.
