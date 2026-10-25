# Wallaby Popcorn Desktop

Independent fork of [Jellyfin Desktop](https://github.com/jellyfin/jellyfin-desktop), retaining upstream **2.0.0** and its source history. Current work is on **Development**, for Ubuntu/Kubuntu amd64.

Built-in SSH tunnelling, Wallaby artwork, cinema list/fanart browsing, technical media details and in-app access to Jellyfin server administration.

**Pre-build development source only:** no new desktop DEB has been compiled, installed or runtime-validated yet. The first planned build is Ubuntu 26.04 LTS amd64, after the requested reboot. Android releases live in the [separate Android fork](https://github.com/bluesilent9/wallaby-popcorn).

- [Changes, upstream tracking and licenses](README-WALLABY.md)
- [Guarded Ubuntu DEB preparation/build instructions](docs/ubuntu-build.md)
- [Browser-only design previews](previews/README.md)
- [Original upstream README](docs/upstream-README.md)

Run `packaging/ubuntu/build-deb.sh` without arguments for preflight only. Compilation requires the explicit `--build` argument.
