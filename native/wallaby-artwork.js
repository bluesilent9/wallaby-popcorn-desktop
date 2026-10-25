/* Delayed, cancellable artwork loading. The currently displayed image is never cleared on selection. */
(() => {
    function createArtworkScheduler({ load, show, delay = 1000, later = setTimeout, cancel = clearTimeout }) {
        let generation = 0, timer = null;
        function stop() { generation++; if (timer !== null) cancel(timer); timer = null; }
        function select(url, wait = delay) {
            stop(); const ticket = generation;
            timer = later(async () => {
                timer = null;
                try {
                    const image = await load(url);
                    if (ticket === generation) show(image);
                } catch (_) { /* Retain the previous image if the new one fails to load. */ }
            }, wait);
        }
        return { select, cancel: stop };
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { createArtworkScheduler };
    if (typeof window !== 'undefined') window.wallabyArtwork = { createArtworkScheduler };
})();
