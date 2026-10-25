# Desktop navigation and focus — prepared revision 0wallaby4

Development only, upstream VERSION 2.0.0. Stop before configure/compile/package until Dave reboots and authorizes a build. Prepare only one Ubuntu 26.04 amd64 DEB with one compiler job. GitHub Actions stays disabled. Revision3 remains the installed/tested baseline; no new DEB is produced by this preparation.

## Browsing behaviour

The two-pane title list described in the request has a fixed title viewport and fixed details panel. Only the title viewport scrolls; standard poster/list layouts use the same fixed scrolling workspace. Native filters, search, sort and layout controls remain available above it. The server/Favourites/library navigation toolbar is hidden outside Home, including item details. Dashboard administration retains its own navigation.

Arrow keys in a library are consumed by the browsing controller, including when focus is on a toolbar/search/sort control. Up/down on a title select the previous/next title, fetching an evicted batch if needed. Left/right leave the title area for other visible controls. Between controls, arrows use their screen positions; the remembered title is one focus destination. If nothing has focus, the first arrow restores the last title without advancing it. Hover gives controls focus without activating them; hovering a title selects it and loads its description/artwork.

Escape on an item detail page returns to its originating library and restores the title index/scroll position, including entries beyond the first batch. Escape in a library returns Home regardless of focus. Escape on Home calls the existing native application exit API. Dialogs/menus/video overlays keep their own controls. Native input commands and desktop DOM keys share the navigation controller. Long Escape no longer has a separate immediate-exit action. Backslash uses a Qt desktop shortcut to toggle fullscreen; the existing native-mode mapping remains.

The video badge retains resolution class/codec (such as 720p / H.264) without exact pixel dimensions. The audio badge remains unchanged.

On Home, settled hover over a movie, episode or series waits one second and fades to decoded fanart. Rapid hover changes cannot display stale results. Leaving entries or hovering a library tile fades back to Wallaby Popcorn artwork, including when metadata identifies an otherwise unlabelled tile as a CollectionFolder/UserView/Folder. Series are not mistaken for library tiles merely because they are folders. Home retains native hover/activation behaviour.

## Source validation and remaining build checks

Run `WALLABY_JSDOM=/path/to/jsdom node --test tests/wallaby-*.test.cjs`. Tests cover controller settling, full-library cache eviction, focus loss, all four arrows, hover, filter-control movement, selection of an unloaded entry, details return to entry171, Escape routing/dialog exclusions, modern toolbar CSS, video/audio presentation, Home artwork delay and library fallback. jsdom is test-only and is not packaged.

The local browser preview stalled during attempted visual verification; do not report it as a successful screenshot or native GUI check. DOM integration tests and full-document script smoke checks are the source-level evidence. Qt shortcut handling and real native page layout must still be checked after the explicitly authorized build. No native GUI, server or installed profile was modified during preparation.

Use TMPDIR inside the writable build directory when building in the managed filesystem, as the system temporary directory may be read-only. The working IPv6/SSH transport is unchanged.
