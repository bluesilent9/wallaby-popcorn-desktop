# Desktop revision6 — Standard View in the native view menu

Prepared source on Development. Upstream VERSION stays 2.0.0; next package is
2.0.0-0wallaby6~ubuntu26.04 amd64. Stop before configure, compilation or packaging
until Dave reboots and explicitly authorizes the build. GitHub Actions stays disabled.

The existing six-squares View Settings button now offers Grid View, List View and
Standard View. Standard View is the custom fixed title-list/details layout. No
separate toggle is created. The native Grid/List callbacks, image-settings gear,
filters and item actions remain in place. A checkmark indicates Standard View;
native checkmarks return when switching back to Grid/List. The extra menu entry
supports keyboard activation and the native menu's focus traversal.

Jellyfin already persists native Grid/List settings with useLocalStorage, keyed by
view type and library ID (useLibrary.tsx and utils/settings.ts in jellyfin-web).
Wallaby preserves that behavior. Its custom layout override is stored locally per
server address, signed-in user ID and library ID. The historical wallaby.cinema
key and cinema value are deliberately retained so existing preferences migrate
without a reset. Historical standard means native Grid/List, not the new label.
Signing out, revisiting the library or restarting the app keeps that preference
on this computer/profile. No cross-device preference synchronization is claimed.

Nineteen source tests pass with jsdom enabled. The menu regression covers repeated
Grid/List/Standard switching, keyboard activation, gear handling, recreated menus,
checkmarks, user/library isolation and restoration after sign-out. Existing paging,
cache, title actions, focus, artwork and navigation checks also pass. Both library
previews expose the menu for inspection. Native application validation remains for
after the authorized build; no configure/build/package/install was run during prep.

Use the prepared Ubuntu 26.04 dependency prefix, one build job and writable build
TMPDIR as in the revision5 build handover. Build only the desktop DEB.
