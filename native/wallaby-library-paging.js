/* Every library layout: keep the native filter query, virtualize every row, fetch bounded batches. */
(() => {
    const PAGE = 100, ROW = 64, CACHE_PAGES = 8;
    function continuationQuery(query, start) {
        const clean = Object.fromEntries(Object.entries(query).filter(([key]) => !['startindex', 'limit', 'enabletotalrecordcount'].includes(key.toLowerCase())));
        return { ...clean, StartIndex: start, Limit: PAGE, EnableTotalRecordCount: true };
    }
    function queryFromUrl(raw, library, origin) {
        try {
            const url = new URL(raw, origin);
            if (url.origin !== origin || !/\/Items\/?$/i.test(url.pathname)) return null;
            const query = Object.fromEntries([...url.searchParams].map(([key, value]) => [key[0].toUpperCase() + key.slice(1), value]));
            return query.ParentId === library && (Number(query.Limit) > 0 || query.IncludeItemTypes) ? query : null;
        } catch (_) { return null; }
    }
    function boundedQuery(query) {
        const limit = Object.entries(query).find(([key]) => key.toLowerCase() === 'limit')?.[1];
        if (Number(limit) > 0 && Number(limit) <= PAGE) return { ...query };
        return { ...Object.fromEntries(Object.entries(query).filter(([key]) => key.toLowerCase() !== 'limit')), Limit: PAGE };
    }
    function boundedUrl(raw, query) {
        const url = new URL(raw, location.origin);
        for (const key of [...url.searchParams.keys()]) if (key.toLowerCase() === 'limit') url.searchParams.delete(key);
        url.searchParams.set('limit', String(boundedQuery(query).Limit || boundedQuery(query).limit));
        return url.href;
    }
    function queryIdentity(query) {
        return JSON.stringify(Object.entries(continuationQuery(query, 0))
            .filter(([key]) => !['userid', 'api_key'].includes(key.toLowerCase()))
            .map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(',') : String(value)])
            .sort(([a], [b]) => a.localeCompare(b)));
    }
    const helpers = { queryIdentity, continuationQuery, queryFromUrl, boundedQuery, PAGE, ROW, CACHE_PAGES };
    if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
    if (typeof window === 'undefined') return;
    let captures = [], active, host, epoch = 0, queued = false, recovery = '';
    let internal = false;
    const cache = new Map(), bindings = new WeakMap(), hidden = new Set();
    function record(client, query, result) {
        if (!Array.isArray(result?.Items)) return;
        const user = client.getCurrentUserId();
        captures = [{ client, user, query, result }, ...captures].slice(0, 4);
        if (active && !captures.includes(active.capture)) captures.push(active.capture);
        window.dispatchEvent(new Event('wallaby-library-query'));
    }
    function install(client) {
        if (!client?.getItems || bindings.has(client)) return;
        const original = client.getItems; bindings.set(client, original);
        client.getItems = function(user, query, ...args) {
            const route = window.wallabyLibraryRoute?.(location.hash);
            const eligible = route && user === client.getCurrentUserId() && query?.ParentId === route && (Number(query.Limit) > 0 || query.IncludeItemTypes);
            if (eligible) query = boundedQuery(query);
            const promise = original.call(this, user, query, ...args);
            if (eligible) Promise.resolve(promise).then(result => {
                if (window.wallabyLibraryRoute?.(location.hash) === route && user === client.getCurrentUserId()) record(client, { ...query }, result);
            }, () => {});
            return promise;
        };
    }
    // Modern Jellyfin uses its SDK rather than window.ApiClient. Observe its completed XHRs too.
    const xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        const route = window.wallabyLibraryRoute?.(location.hash);
        let query = !internal && String(method).toUpperCase() === 'GET' && queryFromUrl(url, route, location.origin);
        if (query) { url = boundedUrl(url, query); query = boundedQuery(query); }
        if (query) this.addEventListener('load', () => {
            const client = window.ApiClient;
            if (!client || window.wallabyLibraryRoute?.(location.hash) !== route || this.status !== 200) return;
            try { record(client, query, this.responseType === 'json' ? this.response : JSON.parse(this.responseText)); } catch (_) {}
        }, { once: true });
        return xhrOpen.call(this, method, url, ...args);
    };
    if (window.fetch) {
        const fetch = window.fetch;
        window.fetch = function(input, init) {
            const route = window.wallabyLibraryRoute?.(location.hash);
            const method = init?.method || input?.method || 'GET';
            let query = !internal && String(method).toUpperCase() === 'GET' && queryFromUrl(input?.url || String(input), route, location.origin);
            if (query) {
                const url = boundedUrl(input?.url || String(input), query);
                input = typeof Request !== 'undefined' && input instanceof Request ? new Request(url, input) : url;
                query = boundedQuery(query);
            }
            const result = fetch.call(this, input, init);
            if (query) Promise.resolve(result).then(async response => {
                if (!response.ok || window.wallabyLibraryRoute?.(location.hash) !== route || !window.ApiClient) return;
                try { record(window.ApiClient, query, await response.clone().json()); } catch (_) {}
            }, () => {});
            return result;
        };
    }
    function request(client, user, query) {
        internal = true;
        try { return Promise.resolve(bindings.get(client).call(client, user, query)); }
        finally { internal = false; }
    }
    function reset() {
        epoch++; active = null; host?.parentElement?.classList.remove('wallaby-cinema-virtualized', 'wallaby-library-managed');
        const parent = host?.parentElement;
        parent?.querySelectorAll('[data-wallaby-original-id]').forEach(node => { node.dataset.id = node.dataset.wallabyOriginalId; delete node.dataset.wallabyOriginalId; });
        host?.remove(); host = null; cache.clear();
        hidden.forEach(node => node.classList.remove('wallaby-cinema-paging-hidden')); hidden.clear();
    }
    function clear() { reset(); captures = []; recovery = ''; }
    function hidePaging(container) {
        // The modern toolbar lives outside main/.page. Its badge is a result count, never a memory setting.
        const nodes = document.querySelectorAll('.MuiToolbar-root.padded-left.padded-right .MuiChip-root, .MuiChip-label, .listPaging, .paging, .pagingButtons, .count, button[title="Previous"], button[title="Next"], [data-testid="NavigateBeforeIcon"], [data-testid="NavigateNextIcon"]');
        for (const node of nodes) {
            if (node.closest('[role="dialog"], [role="menu"], .dialog, .MuiPopover-root')) continue;
            if (node.classList.contains('MuiChip-label') && !node.closest('.MuiToolbar-root.padded-left.padded-right') && !/^[\d,.\s–\-/]+(?:of[\d,.\s]+)?$/i.test(node.textContent.trim())) continue;
            const target = node.closest('.MuiChip-root') || node.closest('button') || node;
            if (!target.classList.contains('wallaby-cinema-paging-hidden')) target.classList.add('wallaby-cinema-paging-hidden');
            hidden.add(target);
        }
    }
    function attach(container, onSelect, onOpen, options = {}) {
        const mode = options.mode || 'cinema';
        if (!container.classList.contains('wallaby-library-managed')) container.classList.add('wallaby-library-managed');
        hidePaging(container);
        const client = window.ApiClient; install(client);
        const originals = [...container.querySelectorAll('.card[data-id], .listItem[data-id], .card[data-wallaby-original-id], .listItem[data-wallaby-original-id]')].filter(node => !node.closest('.wallaby-virtual-library'));
        const ids = originals.map(card => card.dataset.wallabyOriginalId || card.dataset.id);
        if (!client) return;
        const capture = captures.find(entry => entry.client === client && entry.user === client.getCurrentUserId() &&
            entry.result.Items.length === ids.length && entry.result.Items.every((item, i) => item.Id === ids[i]));
        if (!capture) {
            if (!host?.isConnected) {
                host = document.createElement('div'); host.className = 'wallaby-virtual-library';
                host.textContent = 'Loading library…'; host.style.minHeight = '64px'; container.append(host);
            }
            // The first request can finish before extension injection. Recover its exact filter URL.
            const route = window.wallabyLibraryRoute?.(location.hash);
            const url = performance.getEntriesByType('resource').map(entry => entry.name).reverse().find(name => queryFromUrl(name, route, location.origin));
            if (url && recovery !== url) {
                recovery = url; const ticket = epoch, user = client.getCurrentUserId();
                request(client, user, queryFromUrl(url, route, location.origin)).then(result => {
                    if (ticket === epoch && user === client.getCurrentUserId()) record(client, queryFromUrl(url, route, location.origin), result);
                }, () => { recovery = ''; });
            }
            return; // Wait for the real filter query; never substitute an unfiltered or truncated list.
        }
        const sameQuery = active && capture.client === active.capture.client && capture.user === active.capture.user &&
            queryIdentity(capture.query) === queryIdentity(active.capture.query);
        if (sameQuery && active.container === container) {
            if (host?.parentElement !== container) {
                // Jellyfin refreshes innerHTML on query updates. Reattach the viewport without discarding cached titles.
                host?.remove(); host = document.createElement('div'); host.className = 'wallaby-virtual-library';
                host.setAttribute('aria-label', `${active.total.toLocaleString()} library titles`); container.append(host);
                active.dirty = true;
                // Establish the saved scroll range before restoring the browser-clamped scroll offset.
                host.style.height = `${Math.ceil(active.total / active.columns) * active.rowHeight}px`;
                container.scrollTop = active.scrollTop || 0;
            }
            for (const original of originals) for (const node of [original, ...original.querySelectorAll('[data-id]')]) {
                if (node.dataset.id) { node.dataset.wallabyOriginalId = node.dataset.id; delete node.dataset.id; }
            }
            // A refreshed SDK response is not a new library. Preserve its scroll/cache and loaded rows.
            if (active.capture !== capture) {
                active.capture = capture;
                const start = Number(capture.query.StartIndex || 0), total = Number(capture.result.TotalRecordCount);
                if (Number.isSafeInteger(total) && total >= 0 && active.total !== total) { active.total = total; active.dirty = true; }
                if (start % PAGE === 0 && capture.result.Items.length >= Math.min(PAGE, active.total - start)) {
                    const previous = cache.get(start);
                    if (JSON.stringify(previous?.Items) !== JSON.stringify(capture.result.Items)) {
                        cache.delete(start); cache.set(start, capture.result); active.dirty = true;
                        while (cache.size > CACHE_PAGES) cache.delete(cache.keys().next().value);
                    }
                }
            }
            const signature = `${container.className.split(/\s+/).filter(name => !name.startsWith('wallaby-')).join(' ')}|${originals[0]?.className}`;
            if (active.mode !== mode || active.signature !== signature || active.width !== Math.round(container.getBoundingClientRect().width)) {
                active.mode = mode; active.signature = signature; measure(active, container, originals[0]); active.dirty = true;
            }
            if (active.dirty) paint();
            return;
        }
        reset();
        const total = Number(capture.result.TotalRecordCount);
        if (!Number.isSafeInteger(total) || total < 0) return;
        active = { container, scrollTop: container.scrollTop, capture, total, onSelect, onOpen, mode, template: null, columns: 1, rowHeight: ROW, width: 0, signature: '', loading: false, failed: false, start: -1, end: -1 };
        const initialStart = Number(capture.query.StartIndex || 0);
        if (initialStart % PAGE === 0 && capture.result.Items.length >= Math.min(PAGE, total - initialStart)) cache.set(initialStart, capture.result);
        host = document.createElement('div'); host.className = 'wallaby-virtual-library';
        host.setAttribute('aria-label', `${total.toLocaleString()} library titles`);
        container.append(host); container.classList.add('wallaby-cinema-virtualized', 'wallaby-library-managed');
        active.signature = `${container.className.split(/\s+/).filter(name => !name.startsWith('wallaby-')).join(' ')}|${originals[0]?.className}`;
        measure(active, container, originals[0]);
        for (const original of originals) {
            for (const node of [original, ...original.querySelectorAll('[data-id]')]) {
                if (node.dataset.id) { node.dataset.wallabyOriginalId = node.dataset.id; delete node.dataset.id; }
            }
        }
        hidePaging(container); paint();
    }
    function item(id) { for (const result of cache.values()) { const value = result.Items.find(entry => entry.Id === id); if (value) return value; } }
    function measure(state, container, original) {
        const width = Math.round(container.getBoundingClientRect().width) || innerWidth;
        state.width = width;
        if (original) {
            state.template = original.cloneNode(true);
            for (const node of [state.template, ...state.template.querySelectorAll('[data-wallaby-original-id]')]) {
                if (node.dataset.wallabyOriginalId) { node.dataset.id = node.dataset.wallabyOriginalId; delete node.dataset.wallabyOriginalId; }
            }
            state.template.querySelectorAll('.wallaby-cinema-caption').forEach(node => node.remove());
            state.template.classList.remove('wallaby-cinema-selected');
        }
        state.columns = 1; state.rowHeight = ROW;
        if (state.mode === 'cinema' || !state.template) return;
        const probe = state.template.cloneNode(true);
        probe.classList.add('wallaby-measure'); probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText += ';position:absolute!important;visibility:hidden!important;display:block!important;pointer-events:none!important;';
        container.append(probe);
        const rectangle = probe.getBoundingClientRect();
        const isList = probe.classList.contains('listItem') || container.classList.contains('vertical-list');
        state.columns = isList ? 1 : Math.max(1, Math.floor((width + 12) / ((rectangle.width || 180) + 12)));
        const cellWidth = (width - 12 * (state.columns - 1)) / state.columns;
        probe.style.setProperty('width', `${cellWidth}px`, 'important');
        state.rowHeight = Math.max(ROW, Math.ceil(probe.getBoundingClientRect().height || (isList ? 88 : cellWidth * 1.5 + 58))) + 12;
        probe.remove();
    }
    function nativeCard(state, item, index) {
        const card = state.template?.cloneNode(true) || document.createElement('a');
        const oldId = card.dataset.id;
        card.classList.add('wallaby-virtual-card'); card.classList.remove('wallaby-cinema-selected');
        card.dataset.id = item.Id; card.dataset.index = index; card.dataset.type = item.Type || 'Movie';
        card.dataset.serverid = item.ServerId || state.capture.client.serverId?.() || '';
        card.dataset.positionticks = String(item.UserData?.PlaybackPositionTicks || 0);
        card.dataset.isfolder = String(!!item.IsFolder); card.dataset.mediatype = item.MediaType || 'Video';
        for (const key of ['playlistitemid', 'channelid', 'parentid', 'collectionid', 'playlistid', 'path', 'timerid', 'seriestimerid']) delete card.dataset[key];
        if (item.ParentId) card.dataset.parentid = item.ParentId;
        if (item.PlaylistItemId) card.dataset.playlistitemid = item.PlaylistItemId;
        const title = item.Name || 'Untitled';
        const details = `#/details?${new URLSearchParams({ id: item.Id, serverId: card.dataset.serverid })}`;
        card.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
        card.querySelectorAll('a[href]').forEach(node => node.setAttribute('href', details));
        if (card.tagName === 'A') card.setAttribute('href', details);
        card.querySelectorAll('[data-id]').forEach(node => { node.dataset.id = item.Id; node.dataset.serverid = card.dataset.serverid; node.dataset.itemtype = card.dataset.type; });
        card.querySelectorAll('[data-played]').forEach(node => node.dataset.played = String(!!item.UserData?.Played));
        card.querySelectorAll('[data-isfavorite]').forEach(node => node.dataset.isfavorite = String(!!item.UserData?.IsFavorite));
        card.querySelectorAll('.playedIndicator, .countIndicator, .unplayedCountIndicator, .itemProgressBar, .listItemProgressBar, [data-blurhash]').forEach(node => {
            if (node.hasAttribute('data-blurhash')) node.removeAttribute('data-blurhash'); else node.remove();
        });
        const lines = [...card.querySelectorAll('.cardText:not(.cardDefaultText), .listItemBodyText')];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const value = i === 0 ? title : i === 1 ? String(item.ProductionYear || '') : '';
            const link = line.querySelector('a, .itemAction:not(button)');
            if (link) link.textContent = value;
            else if (!line.querySelector('button')) line.textContent = value;
            else {
                [...line.childNodes].filter(node => node.nodeType === 3).forEach(node => node.remove());
                line.append(document.createTextNode(value));
            }
        }
        card.querySelectorAll('.listItem-overview').forEach(node => node.textContent = item.Overview || '');
        if (!lines.length) { const text = document.createElement('span'); text.className = 'cardText'; text.textContent = title; card.append(text); }
        const pictures = card.querySelectorAll('.cardImageContainer, .listItemImage, img');
        for (const picture of pictures) {
            const previous = picture.getAttribute('data-src') || picture.getAttribute('src') || picture.style.backgroundImage || '';
            const requested = previous.match(/\/Images\/(\w+)/i)?.[1] || 'Primary';
            const type = item.ImageTags?.[requested] ? requested : item.ImageTags?.Primary ? 'Primary' : null;
            const url = type ? state.capture.client.getImageUrl?.(item.Id, { type, maxWidth: 480, tag: item.ImageTags[type] }) : '';
            picture.removeAttribute('data-src'); picture.removeAttribute('srcset'); picture.classList.remove('lazy');
            if (picture.tagName === 'IMG') { picture.alt = title; picture.loading = 'lazy'; picture.decoding = 'async'; if (url) picture.src = url; else picture.removeAttribute('src'); }
            else picture.style.backgroundImage = url ? `url("${url.replace(/"/g, '%22')}")` : 'none';
            picture.setAttribute('aria-label', title);
        }
        const imageHost = card.querySelector('.cardImageContainer, .listItemImage');
        if (imageHost && item.UserData?.Played) {
            const played = document.createElement('div'); played.className = 'playedIndicator indicator';
            const icon = document.createElement('span'); icon.className = 'material-icons indicatorIcon check'; icon.setAttribute('aria-hidden', 'true');
            played.append(icon); imageHost.append(played);
        }
        if (imageHost && item.UserData?.UnplayedItemCount) {
            const count = document.createElement('div'); count.className = 'countIndicator indicator'; count.textContent = item.UserData.UnplayedItemCount; imageHost.append(count);
        }
        const progress = Number(item.UserData?.PlayedPercentage || 0);
        if (imageHost && progress > 0 && progress < 100) {
            const track = document.createElement('div'); track.className = 'itemProgressBar';
            const fill = document.createElement('div'); fill.className = 'itemProgressBarForeground'; fill.style.width = `${progress}%`;
            track.append(fill); imageHost.append(track);
        }
        card.querySelectorAll('.cardDefaultText').forEach(node => node.textContent = title);
        card.style.setProperty('width', '100%', 'important'); card.style.height = `${state.rowHeight - 12}px`; card.style.overflow = 'hidden';
        card.tabIndex = 0;
        card.removeAttribute('title'); card.setAttribute('aria-label', title); card.dataset.wallabyIndex = index;
        return card;
    }
    function cinemaRow(state, item, index) {
        const row = document.createElement('div'); row.className = 'wallaby-cinema-row'; row.tabIndex = 0; row.dataset.wallabyIndex = index;
        if (item) {
            row.dataset.id = item.Id; row.setAttribute('role', 'button');
            const caption = document.createElement('span'); caption.className = 'wallaby-cinema-caption';
            for (const [kind, text] of [['name', item.Name || 'Untitled'], ['year', item.ProductionYear || '']]) {
                const span = document.createElement('span'); span.className = `wallaby-cinema-${kind}`; span.textContent = text; caption.append(span);
            }
            row.append(caption); row.addEventListener('click', () => state.onSelect(row)); row.addEventListener('focus', () => state.onSelect(row));
            row.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); state.onOpen(row); } });
        }
        return row;
    }
    function paint() {
        if (!active || !host?.isConnected) return;
        active.scrollTop = active.container.scrollTop;
        const state = active, columns = state.columns, height = state.rowHeight;
        const totalRows = Math.ceil(state.total / columns);
        const viewport = host.parentElement;
        const inset = viewport.classList.contains('wallaby-library-viewport') ? viewport.getBoundingClientRect().top : 100;
        const offset = Math.max(0, -host.getBoundingClientRect().top + inset);
        const startRow = Math.min(Math.max(0, totalRows - 1), Math.max(0, Math.floor(offset / height) - 3));
        const viewHeight = viewport.classList.contains('wallaby-library-viewport') ? viewport.clientHeight || innerHeight : innerHeight;
        const endRow = Math.min(totalRows, startRow + Math.ceil(viewHeight / height) + 7);
        const start = startRow * columns, end = Math.min(state.total, endRow * columns);
        if (start === state.start && end === state.end && !state.dirty) return;
        state.start = start; state.end = end; state.dirty = false;
        const focused = document.activeElement?.closest?.('[data-wallaby-index]');
        const focusIndex = focused?.dataset.wallabyIndex;
        const fragment = document.createDocumentFragment();
        const spacer = pixels => { const div = document.createElement('div'); div.style.height = `${pixels}px`; div.setAttribute('aria-hidden', 'true'); return div; };
        fragment.append(spacer(startRow * height));
        const content = document.createElement('div');
        content.className = state.mode === 'cinema' ? 'wallaby-virtual-cinema' : columns > 1 ? 'wallaby-virtual-grid' : 'wallaby-virtual-native-list';
        if (columns > 1) { content.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`; content.style.paddingBottom = '12px'; }
        let missing = null;
        for (let index = start; index < end; index++) {
            const pageStart = Math.floor(index / PAGE) * PAGE;
            const item = cache.get(pageStart)?.Items?.[index - pageStart];
            const row = item && state.mode !== 'cinema' ? nativeCard(state, item, index) : cinemaRow(state, item, index);
            if (!item) {
                row.style.height = `${height - (state.mode === 'cinema' ? 0 : 12)}px`;
                if (state.mode !== 'cinema' && columns === 1) row.style.marginBottom = '12px';
                row.textContent = state.failed ? 'Couldn’t load titles — activate to retry' : 'Loading titles…';
                if (missing === null) missing = pageStart;
                if (state.failed) {
                    row.setAttribute('role', 'button'); const retry = () => { state.failed = false; state.dirty = true; paint(); };
                    row.addEventListener('click', retry); row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') retry(); });
                }
            }
            content.append(row);
        }
        fragment.append(content, spacer(Math.max(0, totalRows - endRow) * height)); host.replaceChildren(fragment);
        host.style.removeProperty('height');
        const wanted = state.pendingFocus ?? focusIndex;
        const target = wanted != null && host.querySelector(`[data-wallaby-index="${wanted}"][data-id]`);
        if (target) { state.pendingFocus = null; target.focus({ preventScroll: true }); }
        if (missing !== null && !state.loading && !state.failed) load(missing, state);
    }
    async function load(start, state) {
        const ticket = epoch; state.loading = true;
        try {
            const { client, user, query } = state.capture;
            const result = await request(client, user, continuationQuery(query, start));
            if (ticket !== epoch || active !== state || client !== window.ApiClient || user !== client.getCurrentUserId()) return;
            if (!Array.isArray(result?.Items) || !result.Items.length) throw new Error('No remaining items returned');
            cache.delete(start); cache.set(start, result);
            while (cache.size > CACHE_PAGES) cache.delete(cache.keys().next().value);
            if (Number.isSafeInteger(result.TotalRecordCount)) state.total = result.TotalRecordCount;
        } catch (_) { if (ticket === epoch) state.failed = true; }
        finally { if (ticket === epoch) { state.loading = false; state.dirty = true; paint(); window.dispatchEvent(new Event('wallaby-library-query')); } }
    }
    function focusIndex(index) {
        if (!active || !host?.isConnected || !active.total) return false;
        index = Math.max(0, Math.min(active.total - 1, index));
        const viewport = host.parentElement;
        const rowTop = Math.floor(index / active.columns) * active.rowHeight;
        if (rowTop < viewport.scrollTop || rowTop + active.rowHeight > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = rowTop;
        active.pendingFocus = index; active.dirty = true; paint(); return true;
    }
    function schedule() { if (active && host?.isConnected) active.scrollTop = active.container.scrollTop; if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; paint(); }); } }
    window.wallabyLibraryPaging = { install, attach, reset, clear, item, focusIndex, status: () => active ? { total: active.total, loading: active.loading } : { total: null, loading: true }, queryKey: () => active ? queryIdentity(active.capture.query) : '' };
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule); window.addEventListener('hashchange', clear);
    setInterval(() => install(window.ApiClient), 250); install(window.ApiClient);
})();
