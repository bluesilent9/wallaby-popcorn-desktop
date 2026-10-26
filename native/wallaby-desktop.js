/* Non-visual desktop link routing. The server owns its entire web interface. */
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
    const helpers = { isManagementUrl };
    if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
    if (typeof window !== 'undefined') window.wallabyDesktop = helpers;
})();
