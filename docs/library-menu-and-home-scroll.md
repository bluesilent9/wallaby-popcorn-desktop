# Desktop revision7 — modal menu and Home scrolling

Prepared Development source only. Upstream VERSION remains 2.0.0; the next DEB
is 2.0.0-0wallaby7~ubuntu26.04 amd64. Stop before configure, compilation or
packaging until Dave reboots and explicitly authorizes the build. Keep Actions disabled.

The native MUI view popover sets aria-hidden on the application behind it. The
controller previously treated that accessibility state as visual invisibility and
returned before injecting Standard View. Library attachment now checks actual
layout visibility independently of accessibility focus visibility. Standard View
remains in the existing Grid/List menu, with the same saved per-library choice.
The regression fixture now sets aria-hidden on main, like the real popover. It
fails against revision6 and passes with this change. Preview menus reproduce it too.

Home no longer masks the entire tall scrolling page, or rewrites mask offsets on
scroll. That large composited layer was consistent with the reported blank lower
shelves and transient header repaint/offset artifacts. A separate fixed strip under
the transparent header covers scrolling cards with matching wallpaper and fades
out at the header edge. Only this small overlay is masked. Its artwork uses the
same full-viewport sizing, shading and crossfade timing as the main wallpaper.
No blur/backdrop filter or scroll-driven positioning is used. Page contents,
scrolling, lazy-loading and the native header remain in their normal document layers.

Seven source regression files pass (19 test cases), including modal view switching,
per-user/library preferences, bounded paging, title navigation, tall unmasked Home
content, a header strip that does not mutate during scroll, route cleanup and
matching Home/header artwork. No failures or skips. A browser preview scrolled
3602px to its final sample shelf, with the last shelf inside the viewport and the
main mask computed as none. This is preview/source verification, not Qt-native
application validation; the reported glitches need retesting after the next DEB.

No configure, compilation, packaging, installation, server changes or other
platform builds were performed during preparation. Build only Ubuntu 26.04 amd64,
one job, using the prepared dependency prefix and writable build TMPDIR as before.
