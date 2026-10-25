# Desktop cinema view and IPv6 correction (ready for build, not built)

The previous Ubuntu 26.04 DEB built successfully and connected to the server, but its live modern-web library renderer exposed a mismatch that the original simplified preview did not. This source correction stays on Development, retains upstream VERSION 2.0.0, and prepares Debian revision `0wallaby2~ubuntu26.04`. Stop before configuring or compiling until the user reboots and authorizes another build.

## Library

Modern Jellyfin uses its SDK for library requests, bypassing the old `window.ApiClient.getItems` hook. The correction also observes its XHR responses and can recover a request that finished before script injection from the same-origin resource URL. A continuation reuses that actual query, preserving filters, search, sorting, library and item type. Only pagination fields change.

Cinema rows now have their own DOM/CSS rather than inheriting Jellyfin card containment, grid centering and hidden text rules. Names and years come from item metadata. Every row is virtualized, including the first 100. The list can reach the full result count: 100 items per request, at most eight cached batches, approximately one viewport plus overscan in the DOM. This removes the 100-title page boundary, not all memory use. Obsolete native range text and previous/next controls are hidden only while this complete cinema list is attached; original paging returns when it is disabled. If the original query cannot be recovered, paging stays visible rather than silently showing an incomplete library.

Other native grid/list views retain native pagination. Removing their limit without also replacing their image/DOM rendering would grow memory with the full library and is deliberately deferred. Dashboard and audio controls are unchanged.

Source-only tests cover 1,171 entries, the last title, initial-query recovery, filter preservation, bounded rows, eviction/reload, and restoring native paging. A browser fixture includes native-style card containment and centered containers, and confirms visible left-aligned names/years and separate left/right panels. The native rebuilt application remains untested until the authorized build.

## Why IPv4 was still visible

IPv6-only inbound SSH is separate from loopback HTTP forwarding. The old desktop tunnel explicitly used `127.0.0.1` at both ends and did not force the OpenSSH client to `-6`. Server-enrolled desktop keys also permitted only `127.0.0.1:8096`. This explains a valid source of current IPv4 loopback logs; it does not attribute every historical or other-client log entry to this app.

The correction uses `ssh-keyscan -6`, enrollment `ssh -6`, transport `ssh -6`, a literal AAAA result from the OS resolver, `[::1]` for the local listening endpoint, `[::1]:8096` on the server, and `http://[::1]:PORT` for the web client. Existing host-key pins remain bound to the hostname through HostKeyAlias. QUrl constructs origins so IPv6 brackets survive base-URL extraction.

The Qt web request interceptor, Qt network managers and initial/queued media URL checks reject IPv4, IPv4-mapped IPv6 URLs, and direct HTTP hostnames that could fall back to IPv4. Direct IPv6 HTTP(S)/WebSocket URLs remain possible. Hostnames should use the SSH address flow; AAAA lookup uses `resolvectl` over the OS service rather than opening an IPv4 DNS socket in the app. Missing IPv6 resolution fails with an explicit message and no IPv4 fallback.

The installed Ubuntu launcher activates a libseccomp rule denying AF_INET socket creation before executing the native app; its children inherit the rule. Startup fails closed if the rule cannot be activated. IPv4 proxy environment variables are cleared. This applies to the app process tree, not the whole laptop, resolver daemon, server or other installed clients. The DEB adds libseccomp2 and the release-appropriate resolver package. No OS-wide IPv4 settings or live shared SSH rules were changed.

The IPv6 origin differs from the old IPv4 origin, so a Jellyfin sign-in may be needed again. Keys and existing profile files are not removed, and host verification is not relaxed.

## Required server preparation before testing the new build

Read-only checks confirmed Jellyfin returns HTTP 200 at `http://[::1]:8096/System/Info/Public`. The current desktop key's server restriction still needs to be changed before the new IPv6 tunnel can connect. `sudo -n` is unavailable; no server files were modified during this preparation.

Copy the two scripts under `packaging/server/` and **only the desktop public .pub key** to a private staging directory on the server. Never copy a private key. On the server:

```sh
python3 prepare-ipv6-desktop.py --account dave-laptop --public-key desktop.pub
sudo python3 prepare-ipv6-desktop.py --account dave-laptop --public-key desktop.pub --apply
```

The first command is a dry run. The apply command backs up the installed helper and authorized_keys, atomically installs the helper with a new `--trusted-ipv6` mode for future desktop enrollments, and changes only the matching desktop key's permitted destination from `127.0.0.1:8096` to `[::1]:8096`. It retains the restrictive options, forced false command, and all other keys. No SSH restart is required. The old helper modes remain compatible with existing phones/TV; those clients were not modified or rebuilt by this desktop task. Narrowing this key will stop the old desktop DEB's IPv4 forwarding, so apply it when switching to the new build, not before the reboot.

Local desktop public key:
`~/.local/share/wallaby-popcorn/ssh-tunnel/identity-84badaebfcf38b204c1b199a03106f71c21d83719774c98f8a875e41f94db74d.pub`

After the reboot: build only the Ubuntu 26.04 amd64 DEB with one job, arrange this server step, then test GUI startup under the launcher, login, SSH, playback, dashboard, filtering and scrolling. Do not infer these native runtime results from the source tests.
