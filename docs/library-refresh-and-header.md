# Desktop revision5 — title refresh and Home header

Development source only. Upstream VERSION remains 2.0.0; next DEB is 2.0.0-0wallaby5~ubuntu26.04 amd64. Stop before configure, compilation or packaging until Dave reboots and explicitly authorizes it. GitHub Actions stays disabled. No source or build changes for other platforms.

The virtual pager previously compared captured query objects by identity. Re-observing the same 50-item native query created a fresh object and discarded the 100-item continuation cache, exposing loading placeholders repeatedly. It now compares normalized query contents, preserves the cache and scroll offset, and reattaches its virtual host when Jellyfin replaces native innerHTML. Real filter/query changes still reset their own list. Requests/cache/viewport remain bounded.

The library dropdown and existing layout-switch button share the native right-aligned toolbar, beside the playback/filter/sort/view actions. Moving the actual switch preserves its existing handler; the native dropdown and filters retain theirs. Clicking a cinema title opens that item's details; hover and arrows continue to select without opening.

Home content receives a scroll-position-aware transparency mask where it passes behind the header. The wallpaper and header are outside that mask. The native server button keeps its existing Wallaby icon and server name. Its neighbouring Favourites and library shortcut links are hidden on Home. The original account-menu button retains its avatar and click handler, and gains a themed rounded box with the signed-in Name to its right. This works for non-administrators and does not change permissions.

Leaving a movie/episode/series or hovering a library tile now holds the previous wallpaper for one second before fading back to Wallaby artwork. Loading/decoding and stale-hover cancellation remain in place.

Nineteen Node source tests pass with the optional external jsdom test dependency. New coverage repeats 50-item native requests while scrolled beyond the initial batch, then replaces native innerHTML and checks loaded titles/cache/scroll continuity. Header tests verify server and account handlers remain native, names are rendered as text for non-admin users, and only Home content gets the scroll fade. Existing focus/escape tests now click the title itself and assert the switch is inside the toolbar. The artwork test checks the return delay too.

Native application/server verification remains for after the next authorized DEB build. Use the existing dependency prefix, one compiler job and writable build-directory TMPDIR, as recorded in the previous build handover. Do not install or build during source preparation.
