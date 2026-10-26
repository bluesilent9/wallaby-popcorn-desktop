# Historical interface designs — not the current desktop UI

As of revision8 the desktop loads the server's Jellyfin interface without client
UI overrides. These mock-ups and the inactive wallaby UI scripts remain only as
reference material for later server-side work; they are excluded from desktop
runtime injection/packaging and do not describe the restored client. The old UI
regression cases are explicitly retired/skipped. Current restoration coverage is
in tests/wallaby-restoration.test.cjs. Artwork remains available for reuse.

No server-side changes have been made as part of the desktop restoration.
