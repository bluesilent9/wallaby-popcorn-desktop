# Wallaby Popcorn Desktop — Development

Wallaby Popcorn is an independent fork of [Jellyfin Desktop](https://github.com/jellyfin/jellyfin-desktop), based on **v2.0.0** (`1634d3d263b881dccc62bf278d1289b471ec7af1`). The upstream history, GPL license and version number are retained. Ubuntu package revisions identify the Wallaby changes separately. Upstream feature updates are merged manually when requested.

The separate [Android fork](https://github.com/bluesilent9/wallaby-popcorn) follows Jellyfin's separate Android repository. This repository contains the desktop client; current work targets Ubuntu/Kubuntu amd64 only and belongs on **Development**. No desktop stable release has been published.

## Changes

- Existing working `ssh://user@host:port` integration retained from the earlier Kubuntu Flatpak. OpenSSH resolves IPv6 hostnames, pins the host key after explicit fingerprint confirmation, owns its tunnel process, and forwards only to the server's loopback Jellyfin port. Existing installed server enrollment helpers are reused. No Wallaby Agent service is needed for this app's tunnel.
- Wallaby Popcorn app identity, the Android Development artwork, transparent in-app mascot and adaptive light/dark wordmarks. Original upstream legal attribution remains.
- An administrator-only **Manage server** button opens the authenticated server's own dashboard inside the app, over the existing connection. Server authorization remains authoritative. Ordinary external links continue to open externally.
- Optional **Cinema list** on movie/TV library pages: existing titles/year list, filters, sorting and item controls, with selected artwork, synopsis and technical information. Full-screen faded backdrop/fanart is supplied by the server. Video resolution/codec, audio format/channels/bitrate/sample rate and subtitle language badges use media stream data. **Original language uses scraped `OriginalLanguage` metadata only**; missing data is marked rather than guessed from file audio or metadata scraping preferences.
- Continuation beyond the initial native library page reuses the captured, matched Jellyfin query and every filter/sort option. Requests are 100 items each; extra rows are virtualized and eight pages cached. Unrecognized server renderers retain native paging instead of guessing a query. Integration needs validation against the live server after compilation.
- First launch of the DEB copies existing Flatpak profiles, WebEngine sessions and app-owned SSH identities/pins into the new per-user data directory, when no new profile directory exists. The old Flatpak must be closed; its original data is preserved. No private user data is included in this source repository.

## Prepare and build

See [Ubuntu packaging](docs/ubuntu-build.md). **No compilation is part of preflight.** Run `packaging/ubuntu/build-deb.sh --build` only after the requested reboot/build authorization. The default is one compiler job. Only Ubuntu **26.04 LTS amd64** is the initial build target.

See [previews](previews/README.md) for browser-only design previews with synthetic content. The dashboard preview is representative; the running app uses the server's real dashboard.

## Upstream and licenses

Retain `upstream` pointing to Jellyfin Desktop and merge deliberately into Development. Keep `VERSION` aligned with the chosen Jellyfin Desktop release. A package named `2.0.0-0wallaby1~ubuntu26.04` still reports upstream app version 2.0.0. Do not install an official Jellyfin update over this fork automatically.

The application retains its upstream GPL-2.0 license. Bundled MpvQt is an unmodified, pinned submodule under its own LGPL terms; its sources and license texts are retained and included in source distribution. See `LICENSE`, `debian/copyright` and `external/mpvqt/LICENSES/`.
