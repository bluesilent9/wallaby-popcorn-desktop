# Desktop design previews — no desktop build required

Serve the repository with `python3 -m http.server 8765 --bind 127.0.0.1`.

- `/previews/library.html` uses the actual injected library view scripts and CSS with a synthetic 1,250-title library and sample artwork. Its sample toolbar is not Jellyfin's real toolbar. Production retains the existing Jellyfin toolbar, query, filters, sort and paging controls.
- `/previews/management.html` is a representative static mock-up of app framing, branding and dashboard sections. It does not connect to or manage a server. The actual app opens the authenticated server's own dashboard, whose layout/content depend on its web-client version. Buttons here have no server effect.

The cinema list observes native `ApiClient.getItems` responses and matches their item IDs against the displayed cards before reusing a query. It preserves all original filter/sort options and overrides only pagination for continuation requests (100 items each). Additional rows are virtualized, with eight batches cached. If the web client/renderer cannot be matched, its existing paging remains available. These integration points need verification against the live server after the desktop build; the preview is not a substitute for that check.

Screenshots are saved outside the source checkout in ../../outputs/.

The accepted library revision uses full-screen faded selected-title fanart, a poster and synopsis, video/audio file badges, coloured two-letter subtitle languages and a separate original-language field from scraped title metadata. The sample file deliberately uses Japanese audio while the sample title has English original-language metadata, to verify they remain independent. Artwork and movie metadata in this fixture are synthetic.
