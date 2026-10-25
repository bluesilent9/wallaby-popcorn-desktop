/* Wallaby desktop-only navigation. Jellyfin remains responsible for authorization. */
(() => {
    function isManagementUrl(current, candidate) {
        try {
            const base = new URL(current);
            const target = new URL(candidate, base);
            return ['http:', 'https:'].includes(target.protocol) && target.origin === base.origin &&
                !target.username && !target.password &&
                (/^#!?\/(dashboard|metadata)(?:[/?]|$)/.test(target.hash) ||
                 /\/(dashboard|metadata)(?:\/|$)/.test(target.pathname));
        } catch (_) { return false; }
    }
    function canManageServer(user) { return user?.Policy?.IsAdministrator === true; }
    const helpers = { isManagementUrl, canManageServer };
    if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
    if (typeof window === 'undefined') return;
    window.wallabyDesktop = helpers;

    let identity = '';
    let administrator = false;
    let userName = '';
    let lastCheck = 0;
    let pending = false;

    function clientIdentity(client) {
        return `${client?.serverAddress?.() || ''}|${client?.getCurrentUserId?.() || ''}`;
    }
    async function refreshPermission(force = false) {
        const client = window.ApiClient;
        const key = clientIdentity(client);
        if (key !== identity) { identity = key; administrator = false; userName = ''; lastCheck = 0; }
        if (!client?.getCurrentUser || !client.getCurrentUserId?.()) { administrator = false; return false; }
        if (!force && (pending || Date.now() - lastCheck < 30000)) return administrator;
        pending = true;
        try {
            const user = await client.getCurrentUser();
            if (clientIdentity(window.ApiClient) === key) {
                administrator = canManageServer(user);
                userName = String(user?.Name || '');
                lastCheck = Date.now();
            }
        } catch (_) { administrator = false; }
        finally { pending = false; }
        return administrator;
    }
    function renderHomeHeader() {
        const home = window.wallabyNavigation?.isHome(location.hash);
        const toolbar = document.querySelector('.MuiAppBar-root > .MuiToolbar-root:first-child') || document.querySelector('.skinHeader');
        if (!toolbar) return;
        // Keep the real ServerButton and user menu handlers; only decorate their presentation.
        const server = [...toolbar.querySelectorAll('a[href]')].find(node => node.querySelector('img') && ['#/', '#/home', '/', '/home'].includes(node.getAttribute('href')));
        if (server) for (const sibling of server.parentElement.children) {
            const hide = home && sibling !== server;
            if (sibling.classList.contains('wallaby-home-nav-hidden') !== hide) sibling.classList.toggle('wallaby-home-nav-hidden', hide);
        }
        const account = toolbar.querySelector('button[aria-controls="app-user-menu"], .headerUserButton');
        if (!account) return;
        const active = home && !!userName;
        if (account.classList.contains('wallaby-user-box') !== active) account.classList.toggle('wallaby-user-box', active);
        let label = account.querySelector('.wallaby-user-name');
        if (!active) { label?.remove(); return; }
        if (!label) { label = document.createElement('span'); label.className = 'wallaby-user-name'; account.append(label); }
        if (label.textContent !== userName) label.textContent = userName;
    }
    function renderControl() {
        renderHomeHeader();
        const existing = document.getElementById('wallaby-manage-server');
        if (!administrator) { existing?.remove(); return; }
        const header = document.querySelector('.headerRight, .headerTop .headerRight');
        if (!header) return; // Keep Jellyfin's dashboard toolbar and its own Back/Home links intact.
        const control = existing || document.createElement('button');
        if (!existing) {
            control.id = 'wallaby-manage-server';
            control.type = 'button';
            control.className = 'wallaby-manage-server';
            control.addEventListener('click', async () => {
                control.disabled = true;
                try {
                    if (await refreshPermission(true)) location.hash = '#/dashboard';
                    else renderControl();
                } finally { control.disabled = false; }
            });
        }
        if (control.textContent !== 'Manage server') control.textContent = 'Manage server';
        control.setAttribute('aria-label', 'Manage Jellyfin server in Wallaby Popcorn');
        control.title = 'Server dashboard — uses this app’s existing connection';
        if (control.parentElement !== header) header.appendChild(control);
    }
    let scheduled = false;
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(async () => {
            scheduled = false;
            await refreshPermission();
            renderControl();
        });
    }
    function start() {
        new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true });
        window.addEventListener('hashchange', schedule);
        window.addEventListener('storage', schedule);
        window.addEventListener('focus', schedule);
        setInterval(schedule, 5000);
        schedule();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
