/* Cinema list: keep the native filter query, virtualize every row, fetch bounded batches. */
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
            return query.ParentId === library && query.IncludeItemTypes && Number(query.Limit) > 0 ? query : null;
        } catch (_) { return null; }
    }
    const helpers = { continuationQuery, queryFromUrl, PAGE, ROW, CACHE_PAGES };
    if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
    if (typeof window === 'undefined') return;
    let captures = [], active, host, epoch = 0, queued = false, recovery = '';
    let internal = false;
    const cache = new Map(), bindings = new WeakMap(), hidden = new Set();
    function record(client, query, result) {
        if (!Array.isArray(result?.Items)) return;
        const user = client.getCurrentUserId();
        captures = [{ client, user, query, result }, ...captures].slice(0, 4);
        window.dispatchEvent(new Event('wallaby-library-query'));
    }
    function install(client) {
        if (!client?.getItems || bindings.has(client)) return;
        const original = client.getItems; bindings.set(client, original);
        client.getItems = function(user, query, ...args) {
            const route = window.wallabyLibraryRoute?.(location.hash);
            const eligible = route && user === client.getCurrentUserId() && query?.ParentId === route && query?.IncludeItemTypes && Number(query.Limit) > 0;
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
        const query = !internal && String(method).toUpperCase() === 'GET' && queryFromUrl(url, route, location.origin);
        if (query) this.addEventListener('load', () => {
            const client = window.ApiClient;
            if (!client || window.wallabyLibraryRoute?.(location.hash) !== route || this.status !== 200) return;
            try { record(client, query, this.responseType === 'json' ? this.response : JSON.parse(this.responseText)); } catch (_) {}
        }, { once: true });
        return xhrOpen.call(this, method, url, ...args);
    };
    function request(client, user, query) {
        internal = true;
        try { return Promise.resolve(bindings.get(client).call(client, user, query)); }
        finally { internal = false; }
    }
    function reset() {
        epoch++; active = null; host?.parentElement?.classList.remove('wallaby-cinema-virtualized');
        host?.remove(); host = null; cache.clear();
        hidden.forEach(node => node.classList.remove('wallaby-cinema-paging-hidden')); hidden.clear();
    }
    function clear() { reset(); captures = []; recovery = ''; }
    function hidePaging(container) {
        const page = container.closest('.page') || container.closest('main') || container.parentElement;
        for (const node of page.querySelectorAll('.listPaging, .paging, .pagingButtons, button[title], [data-testid="NavigateBeforeIcon"], [data-testid="NavigateNextIcon"]')) {
            const isArrow = /^(Previous|Next)$/i.test(node.title || '') || /Navigate(Before|Next)Icon/.test(node.getAttribute('data-testid') || '');
            const target = isArrow ? (node.closest('button') || node) : node;
            if (isArrow || /listPaging|paging/.test(node.className || '')) { target.classList.add('wallaby-cinema-paging-hidden'); hidden.add(target); }
        }
        // Modern toolbar's range badge has no stable class. Match the known range, never filter text.
        for (const node of page.querySelectorAll('span, p, .count, .MuiChip-label')) {
            if (node.children.length === 0 && /^\s*[\d,.]+\s*[-–]\s*[\d,.]+\s+(?:of|\/|de|von)\s+[\d,.]+\s*$/i.test(node.textContent)) {
                node.classList.add('wallaby-cinema-paging-hidden'); hidden.add(node);
            }
        }
    }
    function attach(container, onSelect, onOpen) {
        const client = window.ApiClient; install(client);
        const ids = [...container.querySelectorAll('.card[data-id]')].map(card => card.dataset.id);
        if (!ids.length || !client) return;
        const capture = captures.find(entry => entry.client === client && entry.user === client.getCurrentUserId() &&
            entry.result.Items.length === ids.length && entry.result.Items.every((item, i) => item.Id === ids[i]));
        if (!capture) {
            // The first request can finish before extension injection. Recover its exact filter URL.
            const route = window.wallabyLibraryRoute?.(location.hash);
            const url = performance.getEntriesByType('resource').map(entry => entry.name).reverse().find(name => queryFromUrl(name, route, location.origin));
            if (url && recovery !== url) {
                recovery = url; const ticket = epoch, user = client.getCurrentUserId();
                request(client, user, queryFromUrl(url, route, location.origin)).then(result => {
                    if (ticket === epoch && user === client.getCurrentUserId()) record(client, queryFromUrl(url, route, location.origin), result);
                }, () => { recovery = ''; });
            }
            return; // Keep native paging visible if we cannot recover its actual query.
        }
        if (active?.capture === capture && host?.parentElement === container) { hidePaging(container); return; }
        reset();
        const total = Number(capture.result.TotalRecordCount);
        if (!Number.isSafeInteger(total) || total < 0) return;
        active = { capture, total, onSelect, onOpen, loading: false, failed: false, start: -1, end: -1 };
        cache.set(Number(capture.query.StartIndex || 0), capture.result);
        host = document.createElement('div'); host.className = 'wallaby-virtual-library';
        host.setAttribute('aria-label', `${total.toLocaleString()} library titles`);
        container.append(host); container.classList.add('wallaby-cinema-virtualized');
        hidePaging(container); paint();
    }
    function item(id) { for (const result of cache.values()) { const value = result.Items.find(entry => entry.Id === id); if (value) return value; } }
    function paint() {
        if (!active || !host?.isConnected) return;
        const state = active;
        const offset = Math.max(0, -host.getBoundingClientRect().top + 100);
        const start = Math.min(Math.max(0, state.total - 1), Math.max(0, Math.floor(offset / ROW) - 12));
        const end = Math.min(state.total, start + Math.ceil(innerHeight / ROW) + 30);
        if (start === state.start && end === state.end && !state.dirty) return;
        state.start = start; state.end = end; state.dirty = false;
        const fragment = document.createDocumentFragment();
        const spacer = height => { const div = document.createElement('div'); div.style.height = `${height}px`; div.setAttribute('aria-hidden', 'true'); return div; };
        fragment.append(spacer(start * ROW)); let missing = null;
        for (let index = start; index < end; index++) {
            const pageStart = Math.floor(index / PAGE) * PAGE;
            const item = cache.get(pageStart)?.Items?.[index - pageStart];
            const row = document.createElement('div'); row.className = 'wallaby-cinema-row'; row.tabIndex = 0;
            if (item) {
                row.dataset.id = item.Id; row.setAttribute('role', 'button');
                const caption = document.createElement('span'); caption.className = 'wallaby-cinema-caption';
                for (const [kind, text] of [['name', item.Name || 'Untitled'], ['year', item.ProductionYear || '']]) {
                    const span = document.createElement('span'); span.className = `wallaby-cinema-${kind}`; span.textContent = text; caption.append(span);
                }
                row.append(caption);
                row.addEventListener('click', () => state.onSelect(row));
                row.addEventListener('focus', () => state.onSelect(row));
                row.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); state.onOpen(row); } });
            } else {
                row.textContent = state.failed ? 'Couldn’t load titles — click to retry' : 'Loading titles…';
                if (missing === null) missing = pageStart;
                if (state.failed) { row.setAttribute('role', 'button'); row.addEventListener('click', () => { state.failed = false; state.dirty = true; paint(); }); }
            }
            fragment.append(row);
        }
        fragment.append(spacer(Math.max(0, state.total - end) * ROW)); host.replaceChildren(fragment);
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
    function schedule() { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; paint(); }); } }
    window.wallabyLibraryPaging = { install, attach, reset, clear, item };
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule); window.addEventListener('hashchange', clear);
    setInterval(() => install(window.ApiClient), 250); install(window.ApiClient);
})();
