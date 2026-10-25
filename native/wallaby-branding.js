/* Wallaby Popcorn branding for Jellyfin's dynamically rendered web UI. */
(() => {
    if (window.wallabyPopcornBrandingInstalled) return;
    window.wallabyPopcornBrandingInstalled = true;

    const mark = window.jmpInfo.branding.mark;
    const lightWordmark = window.jmpInfo.branding.lightWordmark;
    const darkWordmark = window.jmpInfo.branding.darkWordmark;
    const bannerPattern = /^banner-(?:light|dark)(?:\.[a-f0-9]+)?\.(?:png|svg)$/i;
    const markPattern = /^(?:(?:icon-transparent|notificationicon|touchicon\d*)(?:\.[a-f0-9]+)?\.png|favicon(?:\.[a-f0-9]+)?\.ico)$/i;

    function logoKind(value) {
        try {
            const name = new URL(value, document.baseURI).pathname.split('/').pop();
            if (bannerPattern.test(name)) return 'wordmark';
            if (markPattern.test(name)) return 'mark';
        } catch (_) { /* A malformed or non-URL image is not a branding asset. */ }
        return null;
    }

    function wordmarkFor(element) {
        // Follow the rendered background rather than the phone's system colour preference.
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const colour = getComputedStyle(parent).backgroundColor.match(/[\d.]+/g);
            if (colour && colour.length >= 3 && (colour.length < 4 || Number(colour[3]) > 0.9)) {
                const brightness = 0.2126 * Number(colour[0]) + 0.7152 * Number(colour[1]) + 0.0722 * Number(colour[2]);
                return brightness > 160 ? darkWordmark : lightWordmark;
            }
        }
        return lightWordmark;
    }

    function replaceBranding() {
        const route = String(location.hash).replace(/^#!?\/?/, '').split('?')[0].replace(/\/$/, '');
        const home = ['', 'home', 'home.html', 'index.html'].includes(route);
        const library = /^(movies|tv|tvshows|list)$/.test(route);
        const media = home || library || ['details', 'item', 'favorites', 'search'].includes(route);
        if (document.body && document.body.classList.contains('wallaby-home') !== home) document.body.classList.toggle('wallaby-home', home);
        if (document.body && document.body.classList.contains('wallaby-media-surface') !== media) document.body.classList.toggle('wallaby-media-surface', media);
        if (document.body && document.body.classList.contains('wallaby-library-active') !== library) document.body.classList.toggle('wallaby-library-active', library);

        document.querySelectorAll('[name="libraryPageSize"], #selectPageSize').forEach(control => {
            const description = document.getElementById('display-settings-lib-pagesize-description');
            const group = description?.closest('.MuiFormControl-root') || control.closest('.MuiFormControl-root, .selectContainer, .inputContainer');
            if (group && !group.classList.contains('wallaby-page-size-setting')) group.classList.add('wallaby-page-size-setting');
        });
        document.querySelectorAll('img[src], img[srcset], picture source[srcset]').forEach(image => {
            const kind = logoKind(image.getAttribute('src')) || image.dataset.wallabyLogo;
            if (kind) {
                const replacement = kind === 'wordmark' ? wordmarkFor(image) : mark;
                if (image.getAttribute('src') !== replacement) image.setAttribute('src', replacement);
                if (image.dataset.wallabyLogo !== kind) image.dataset.wallabyLogo = kind;
                if (image.tagName === 'IMG' && image.getAttribute('alt') !== 'Wallaby Popcorn') image.setAttribute('alt', 'Wallaby Popcorn');
            }
            const srcset = image.getAttribute('srcset');
            if (srcset) {
                let changed = false;
                const replacement = srcset.split(',').map(candidate => {
                    const parts = candidate.trim().split(/\s+/);
                    const sourceKind = logoKind(parts[0]);
                    if (sourceKind) {
                        parts[0] = sourceKind === 'wordmark' ? wordmarkFor(image) : mark;
                        changed = true;
                    }
                    return parts.join(' ');
                }).join(', ');
                if (changed) image.setAttribute('srcset', replacement);
            }
        });
        document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach(link => {
            if (logoKind(link.getAttribute('href'))) link.setAttribute('href', mark);
        });
        document.querySelectorAll('.pageTitleWithDefaultLogo').forEach(title => {
            const image = `url("${wordmarkFor(title)}")`;
            if (title.style.getPropertyValue('--wallaby-wordmark') !== image) title.style.setProperty('--wallaby-wordmark', image);
        });
    }

    let scheduled = false;
    function scheduleBranding() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            replaceBranding();
        });
    }
    function startBranding() {
        if (!document.documentElement) return;
        if (!document.getElementById('wallaby-popcorn-theme')) {
            const style = document.createElement('style');
            style.id = 'wallaby-popcorn-theme';
            style.textContent = window.jmpInfo.branding.css;
            document.documentElement.appendChild(style);
        }
        // The web client replaces headers/dialogs during navigation.
        new MutationObserver(scheduleBranding).observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src', 'srcset', 'href', 'class', 'style'],
    });
        window.addEventListener('hashchange', scheduleBranding);
        replaceBranding();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startBranding, { once: true });
    else startBranding();
})();
