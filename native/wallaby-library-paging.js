/* Observe native queries without changing them; reuse their filters for a bounded virtual continuation. */
(() => {
    const PAGE = 100, ROW = 64, CACHE_PAGES = 8;
    function continuationQuery(query, start) {
        return { ...query, StartIndex: start, Limit: PAGE, EnableTotalRecordCount: true };
    }
    const helpers = { continuationQuery, PAGE, ROW, CACHE_PAGES };
    if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
    if (typeof window === 'undefined') return;
    let captures = [], serial = 0, latestNative = 0, active, host, epoch = 0, queued = false;
    const cache = new Map();
    const bindings = new WeakMap();
    function install(client) {
        if (!client?.getItems || bindings.has(client)) return;
        const original = client.getItems;
        bindings.set(client, original);
        client.getItems = function(user, query, ...args) {
            const ticket = ++serial;
            const library = window.wallabyLibraryRoute?.(location.hash);
            const eligible = user === client.getCurrentUserId() && query?.ParentId === library &&
                query?.IncludeItemTypes && !query.GenreIds && Number(query.Limit) > 0;
            if (eligible) { latestNative = ticket; reset(); }
            const promise = original.call(this, user, query, ...args);
            if (eligible) Promise.resolve(promise).then(result => {
                if (ticket !== latestNative || user !== client.getCurrentUserId() || window.wallabyLibraryRoute?.(location.hash) !== library) return;
                captures = [{ client, user, query: JSON.parse(JSON.stringify(query)), result, ticket }, ...captures].slice(0, 8);
                window.dispatchEvent(new Event('wallaby-library-query'));
            }, () => {});
            return promise;
        };
    }
    function reset() { epoch++; active = null; host?.remove(); host = null; cache.clear(); }
    function clear() { reset(); captures = []; }
    function attach(container, onSelect, onOpen) {
        install(window.ApiClient);
        const ids = [...container.querySelectorAll('.card[data-id]:not(.wallaby-virtual-row)')].map(card => card.dataset.id);
        if (!ids.length) { reset(); return; }
        const capture = captures.find(entry => entry.ticket === latestNative && entry.client === window.ApiClient &&
            entry.user === entry.client.getCurrentUserId() && entry.result?.Items?.length === ids.length &&
            entry.result.Items.every((item, index) => item.Id === ids[index]));
        if (!capture) return; // Unknown server renderer: preserve its normal paging instead of guessing filters.
        if (active?.capture === capture && host?.parentElement === container) return;
        reset();
        const total = Number(capture.result.TotalRecordCount);
        const first = Number(capture.query.StartIndex || 0) + ids.length;
        if (!Number.isSafeInteger(total) || total <= first) return;
        active = { capture, first, total, onSelect, onOpen, loading: false, failed: false, start: -1, end: -1 };
        host = document.createElement('div'); host.className = 'wallaby-virtual-library';
        host.setAttribute('aria-label', 'Remaining library titles'); container.append(host);
        paint();
    }
    function paint() {
        if (!active || !host?.isConnected) return;
        const state = active;
        const offset = Math.max(0, -host.getBoundingClientRect().top + 100);
        const start = Math.min(Math.max(0, state.total - state.first - 1), Math.max(0, Math.floor(offset / ROW) - 12));
        const end = Math.min(state.total - state.first, start + Math.ceil(innerHeight / ROW) + 30);
        if (start === state.start && end === state.end && !state.dirty) return;
        state.start = start; state.end = end; state.dirty = false;
        const fragment = document.createDocumentFragment();
        const spacer = height => { const div = document.createElement('div'); div.style.height = `${height}px`; div.setAttribute('aria-hidden', 'true'); return div; };
        fragment.append(spacer(start * ROW));
        let missing = null;
        for (let index = start; index < end; index++) {
            const absolute = state.first + index;
            const pageStart = Math.floor(absolute / PAGE) * PAGE;
            const item = cache.get(pageStart)?.Items?.[absolute - pageStart];
            const row = document.createElement('div'); row.className = 'card wallaby-virtual-row';
            row.style.height = `${ROW}px`;
            if (item) {
                row.dataset.id = item.Id; row.tabIndex = 0;
                const title = document.createElement('span'); title.className = 'wallaby-cinema-caption';
                const name = document.createElement('span'); name.className = 'wallaby-cinema-name'; name.textContent = item.Name || 'Untitled';
                const year = document.createElement('span'); year.className = 'wallaby-cinema-year'; year.textContent = item.ProductionYear || '';
                title.append(name, year); row.append(title);
                row.addEventListener('click', () => state.onSelect(row));
                row.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); state.onOpen(row); } });
            } else {
                row.textContent = state.failed ? 'Couldn’t load titles — click to retry' : 'Loading titles…';
                if (missing === null) missing = pageStart;
                if (state.failed) { row.tabIndex = 0; row.setAttribute('role', 'button'); row.addEventListener('click', () => { state.failed = false; state.dirty = true; paint(); }); }
            }
            fragment.append(row);
        }
        fragment.append(spacer(Math.max(0, state.total - state.first - end) * ROW));
        host.replaceChildren(fragment);
        if (missing !== null && !state.loading && !state.failed) load(missing, state);
    }
    async function load(start, state) {
        const ticket = epoch; state.loading = true;
        try {
            const { client, user, query } = state.capture;
            const result = await bindings.get(client).call(client, user, continuationQuery(query, start));
            if (ticket !== epoch || active !== state || client !== window.ApiClient || user !== client.getCurrentUserId()) return;
            if (!Array.isArray(result?.Items) || !result.Items.length) throw new Error('No remaining items returned');
            cache.delete(start); cache.set(start, result);
            while (cache.size > CACHE_PAGES) cache.delete(cache.keys().next().value);
            if (Number.isSafeInteger(result.TotalRecordCount)) state.total = result.TotalRecordCount;
        } catch (_) { if (ticket === epoch) state.failed = true; }
        finally { if (ticket === epoch) { state.loading = false; state.dirty = true; paint(); } }
    }
    function schedule() { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; paint(); }); } }
    window.wallabyLibraryPaging = { install, attach, reset, clear };
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', clear);
    // Install early enough to observe the first native library request.
    setInterval(() => install(window.ApiClient), 250);
    install(window.ApiClient);
})();
