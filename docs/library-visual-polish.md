# Desktop library polish — prepared for Debian revision 0wallaby3

Development source only. Upstream VERSION stays 2.0.0. Build one Ubuntu 26.04 amd64 DEB only after Dave reboots and explicitly authorizes it. Do not run configure, compile, package or any GitHub workflow during preparation. Repository Actions remain disabled.

## Behaviour

- Selecting a title retains the previous decoded fanart. After that selection has remained current for one second, load/decode its replacement and crossfade over 700 ms. Superseded requests and failed images cannot clear the current wallpaper. Reduced-motion users receive an immediate replacement after the same hold/load step. The initial fallback is the cinema artwork, never a blank blue layer.
- Home gets subdued cinema artwork. It is not permanently mixed with movie fanart. Media toolbars stay transparent through Jellyfin's scroll states; cinema row backgrounds remain translucent after mode changes.
- Cinema and standard Movie/TV library layouts share virtual scrolling. Native cards are cloned as templates, with titles, years, images, item IDs, links and progress updated for each item. Jellyfin's delegated playback/menu/favourite actions remain attached to their original container. Native filters, sorting, search and alphabet queries are retained for continuation requests.
- Requests are bounded to 100 records, including saved unlimited/large page-size preferences. Up to eight continuation batches are retained, plus the bounded initial native templates/query captures. Only viewport rows plus overscan are rendered; evicted batches are fetched again on return. There is no user-facing 100-title boundary. Home shelves stay short and are not converted into an endless library.
- Range/result badges, previous/next page controls and the desktop page-size setting are hidden. The screenshot's “50” was the current filtered result count, not the internal batch size. Reset filters and filter controls remain available.
- Dashboard, SSH/IPv6 transport, account permissions and other platform source are unchanged.

## Source validation

Run `WALLABY_JSDOM=/path/to/jsdom node --test tests/wallaby-*.test.cjs` for all DOM integration tests (jsdom is an external test-only dependency, not packaged). Ten checks pass: artwork delay/races/failure, navigation, metadata, filter-preserving continuation, 1,171-title end-to-end scrolling/cache eviction, initial request bounds, native card action identity across mode changes, toolbar badge changes and controller settling without mutation loops.

Open `previews/library-regression.html` and `previews/home.html` using a local HTTP server for source-only visual checks. These use sample metadata/artwork and the actual extension scripts/CSS. Native Qt/WebEngine runtime and actual server playback still need checking after the authorized DEB build.

## Artwork provenance

`native/branding/wallaby-popcorn-home-cinema.png` is original generated artwork, 1672 × 941, created with imagegen using the existing Wallaby Popcorn transparent mascot mark as identity reference. Mode: new background generation, opaque, landscape. Prompt: a charming golden wallaby with large ears and warm expressive eyes, sitting in a plush cinema chair watching a film with its red-and-white popcorn bucket; three-quarter side angle, movie-screen face light, dark theatre, subtle projector beam, deep plum/violet, restrained teal and warm gold. Mascot on the right third, dark low-detail negative space to the left/centre for menus. Polished stylized 3D illustration consistent with the reference. No writing, logos, legible film image, buttons or labels.
