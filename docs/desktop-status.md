# Build handover

Accepted design: cinema list on the left and existing filters untouched; selected title's scraped full-screen fanart darkened behind the UI; poster, synopsis, technical media badges, subtitle language boxes and scraped original language on the right. Server dashboard design accepted separately; actual management pages remain supplied by Jellyfin.

Do not compile or create a DEB before the user reboots and authorizes the build. Initial target: Ubuntu 26.04 LTS amd64 only, one compiler job. The source is a Development fork of upstream v2.0.0. Mobile Stable/Development and all existing installations are unchanged.

Prepared dependency prefix: `/home/dave/Documents/Codex/2026-10-24/i/work/desktop-deps/prefix-26.04`.

No CMake configuration, C++ compilation, DEB generation, installation or runtime validation has been performed for this development desktop version.
