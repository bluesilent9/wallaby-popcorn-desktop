/* Desktop browsing keys. Dialogs, text editing and video playback retain their own controls. */
(() => {
    const path = hash => String(hash).replace(/^#!?\/?/, '').split('?')[0].replace(/\/$/, '');
    const isHome = hash => ['', 'home', 'home.html', 'index.html'].includes(path(hash));
    const isLibrary = hash => ['movies', 'tv', 'tvshows', 'list'].includes(path(hash));
    const isDetails = hash => ['details', 'item'].includes(path(hash));
    const helpers = { isHome, isLibrary, isDetails };
    if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
    if (typeof window === 'undefined') return;
    let previous = location.hash, returnToLibrary = null;
    const visible = node => node.getClientRects().length && !node.closest('.hide, [hidden], [aria-hidden="true"]');
    function blocked() {
        return [...document.querySelectorAll('[role="dialog"], [role="menu"], .dialog, .videoOsdPage, .videoPlayerContainer')].some(visible);
    }
    function remember(hash = location.hash) {
        const state = window.wallabyLibrary?.snapshot();
        if (state) returnToLibrary = { ...state, hash, identity: `${window.ApiClient?.serverAddress?.()}|${window.ApiClient?.getCurrentUserId?.()}` };
    }
    function command(action) {
        const key = ({ up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight', back:'Escape' })[action] || action;
        if (blocked()) return false;
        if (key === 'Escape') {
            if (isLibrary(location.hash)) { location.hash = '#/home'; return true; }
            if (isDetails(location.hash)) {
                const identity = `${window.ApiClient?.serverAddress?.()}|${window.ApiClient?.getCurrentUserId?.()}`;
                location.hash = returnToLibrary?.identity === identity ? returnToLibrary.hash : '#/home'; return true;
            }
            if (isHome(location.hash) && window.api?.system?.exit) { window.api.system.exit(); return true; }
        }
        if (isLibrary(location.hash) && /^Arrow(Up|Down|Left|Right)$/.test(key)) return window.wallabyLibrary?.arrow(key) || false;
        return false;
    }
    window.wallabyNavigation = {
        ...helpers, command, remember,
        pending: hash => returnToLibrary?.hash === hash ? returnToLibrary : null,
        restored: () => { returnToLibrary = null; }
    };
    document.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
        if (!isLibrary(location.hash) && event.key !== 'Escape' && event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        if (event.repeat && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); return; }
        if (command(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    document.addEventListener('click', event => {
        if (isLibrary(location.hash) && event.target.closest?.('a[href*="details"], .wallaby-cinema-open')) remember();
    }, true);
    window.addEventListener('hashchange', () => {
        if (isLibrary(previous) && isDetails(location.hash) && returnToLibrary?.hash !== previous) remember(previous);
        previous = location.hash;
    });
})();
