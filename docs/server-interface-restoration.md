# Desktop revision8 — restore the server-owned interface

Prepared on Development; upstream VERSION remains 2.0.0. Next package is
2.0.0-0wallaby8~ubuntu26.04 amd64. Stop before configure, compilation or packaging
until Dave reboots and explicitly authorizes building. Keep Actions disabled.

The client now renders the Jellyfin web interface supplied by its server without
Wallaby graphical overrides. Removed from runtime injection AND Qt packaging:
wallaby-branding.js, wallaby-library-paging.js, wallaby-artwork.js,
wallaby-navigation.js, wallaby-home.js, wallaby-library.js and wallaby-popcorn.css.
These files and the mock-ups remain source-only historical references for later
server-side work. Nothing in that work has been deployed to the server.

The NativeShell script no longer embeds Wallaby CSS or branding data. No injected
logo replacement, Home header/account changes, wallpaper hover/fade, fixed library
viewport, custom Standard View, virtual paging, hidden counters/page-size settings,
client-added Manage server button or custom Escape/arrow handler remains active.
The native input bridge and Esc/Backspace mapping match the upstream v2.0.0 source.
The custom library minimum window size is restored to upstream defaults. The
app-owned backslash fullscreen shortcut remains; it does not alter server content.
Native player/host plugins remain required upstream integration, not UI overrides.

Retained local artwork: launcher icons, window/app identity and the app-owned
find-webclient connection screen, which existed independently of the server UI.
The original Wallaby artwork files remain available for future reuse. Server
logos/layouts/themes are now the server's responsibility, including native Grid/
List menus and paging behavior. Any server/account preferences still apply normally.

Retained non-visual functionality: IPv6-only Qt networking and socket guard,
OpenSSH tunnel lifecycle/resolution/host-key pinning, migration of old Flatpak
profiles and identities, native mpv playback, and same-origin dashboard link routing
through the existing authenticated connection. The routing helper is now pure URL
validation with no document access, UI changes or permission changes.

Validation: five active Node checks pass (four restoration checks plus URL routing).
Eighteen old UI cases are explicitly retired/skipped, not claimed as current tests.
Three Python checks pass for profile migration, scoped IPv6 preparation and the
launcher blocking IPv4 sockets while allowing IPv6. Protected networking sources
and launcher are unchanged from revision7. No C++ compilation or native app runtime
validation occurred; resource exclusion is checked at source level before build.

Next build: use the prepared Ubuntu 26.04 dependency prefix, one job and writable
build TMPDIR. Confirm all retired UI assets are absent from generated resources
and no UI CSS/data is injected. Verify package dependencies, isolated startup and
upgrade simulation. GUI testing after installation should show the original server
interface. Do not build mobile/TV or modify server files/settings during this step.
