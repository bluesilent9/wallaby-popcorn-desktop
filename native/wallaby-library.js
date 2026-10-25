/* Desktop cinema list. Jellyfin owns the query, filters, pagination and item actions. */
(() => {
    function libraryRoute(hash) {
        const [path, query = ''] = String(hash).replace(/^#!?\/?/, '').split('?');
        const params = new URLSearchParams(query);
        const id = params.get('topParentId') || params.get('parentId');
        return id && ['movies', 'tv', 'tvshows', 'list'].includes(path.replace(/\/$/, '')) ? id : null;
    }
    function metadata(item) {
        const minutes = Math.round(Number(item.RunTimeTicks || 0) / 600000000);
        return [item.ProductionYear, item.OfficialRating, minutes ? `${minutes} min` : '',
            item.CommunityRating != null ? `★ ${Number(item.CommunityRating).toFixed(1)}` : ''].filter(Boolean).join(' · ');
    }
    function languageInfo(value) {
        const raw = String(value || '').trim();
        if (!raw || ['und', 'zxx'].includes(raw.toLowerCase())) return { code: '?', name: 'Unspecified' };
        try {
            const code = new Intl.Locale(raw).language;
            const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
            return { code: /^[a-z]{2}$/.test(code) ? code[0].toUpperCase() + code[1] : '?', name: name || raw };
        } catch (_) { return { code: '?', name: raw }; }
    }
    function fileDetails(item) {
        const source = item.MediaSources?.[0];
        const streams = source?.MediaStreams || item.MediaStreams || [];
        const video = streams.find(stream => stream.Type === 'Video' && !stream.IsAttachedPic);
        const audioTracks = streams.filter(stream => stream.Type === 'Audio');
        const audio = audioTracks.find(stream => stream.Index === source?.DefaultAudioStreamIndex) ||
            audioTracks.find(stream => stream.IsDefault) || audioTracks[0];
        const width = Number(video?.Width || 0), height = Number(video?.Height || 0);
        const resolution = !height && !width ? '' : width >= 3840 || height >= 2160 ? '4K UHD' :
            width >= 2560 || height > 1080 ? '1440p' : width >= 1920 || height > 720 ? '1080p' :
            width >= 1280 || height > 576 ? '720p' : `${height || width}${video?.IsInterlaced ? 'i' : 'p'}`;
        const videoCodecs = { h264: 'H.264', hevc: 'HEVC', h265: 'HEVC', av1: 'AV1', mpeg2video: 'MPEG-2', vp9: 'VP9' };
        const audioCodecs = { ac3: 'Dolby Digital', eac3: 'Dolby Digital Plus', truehd: 'Dolby TrueHD',
            dts: 'DTS', aac: 'AAC', flac: 'FLAC', opus: 'Opus', mp3: 'MP3', alac: 'ALAC' };
        const audioCodec = String(audio?.Codec || '').toLowerCase();
        let channels = '';
        if (audio?.ChannelLayout) {
            const layout = audio.ChannelLayout.match(/^(\d+\.\d+)/)?.[1];
            channels = layout ? layout === '1.0' ? 'Mono' : layout === '2.0' ? 'Stereo' : `${layout} Surround` : audio.ChannelLayout.toLowerCase() === 'stereo' ? 'Stereo' : audio.ChannelLayout;
        } else if (audio?.Channels) channels = audio.Channels === 2 ? 'Stereo' : audio.Channels === 1 ? 'Mono' : `${audio.Channels} channels`;
        const subtitles = [...new Map(streams.filter(stream => stream.Type === 'Subtitle').map(stream => {
            const info = languageInfo(stream.Language); return [info.name, info];
        })).values()];
        const spatial = { DolbyAtmos: 'Dolby Atmos', DTSX: 'DTS:X' }[audio?.AudioSpatialFormat] || '';
        const range = video?.VideoRangeType && !['Unknown', 'SDR'].includes(video.VideoRangeType) ?
            video.VideoRangeType.replace(/^DOVI/, 'Dolby Vision ') : video?.VideoRange === 'HDR' ? 'HDR' : '';
        return {
            video: [video?.IsInterlaced ? resolution.replace(/p$/, 'i') : resolution, videoCodecs[String(video?.Codec).toLowerCase()] || video?.Codec?.toUpperCase(), range].filter(Boolean).join(' · '),
            dimensions: width && height ? `${width} × ${height}` : '',
            audio: [audioCodecs[audioCodec] || audio?.Codec?.toUpperCase(), spatial, channels].filter(Boolean).join(' · '),
            audioQuality: [audio?.BitRate ? `${Math.round(audio.BitRate / 1000)} kb/s` : '',
                audio?.SampleRate ? `${Number((audio.SampleRate / 1000).toFixed(1))} kHz` : '',
                audio?.BitDepth ? `${audio.BitDepth}-bit` : ''].filter(Boolean).join(' · '),
            dolby: ['ac3', 'eac3', 'truehd'].includes(audioCodec), subtitles,
            // OriginalLanguage is scraped title metadata. Never infer it from a file stream or metadata locale.
            originalLanguage: item.OriginalLanguage ? languageInfo(item.OriginalLanguage).name : 'Not provided by server',
            hasFile: !!video || !!audio, sourceName: item.MediaSources?.length > 1 ? source?.Name || 'First file version' : '',
            audioTracks: audioTracks.length
        };
    }
    const helpers = { libraryRoute, metadata, languageInfo, fileDetails };
    if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
    if (typeof window === 'undefined') return;

    window.wallabyLibraryRoute = libraryRoute;
    let container, panel, toggle, selected, backdrop, backdropPage, selectedId = '', lastQuery = '', fadeCleanup, key = '', enabled = false, generation = 0, scheduled = false, opening = false;
    const visible = node => node && node.getClientRects().length && !node.closest('.hide, [hidden], [aria-hidden="true"]');
    const cards = () => container ? [...container.querySelectorAll('.card[data-id], .listItem[data-id], .wallaby-cinema-row[data-id]')] : [];
    const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
    function element(tag, className, text) {
        const node = document.createElement(tag); node.className = className;
        if (text) node.textContent = text;
        return node;
    }
    function remember(value) { try { localStorage.setItem(key, value ? 'cinema' : 'standard'); } catch (_) {} }
    function cleanup() {
        generation++;
        clearBackdrop();
        window.wallabyLibraryPaging?.reset();
        container?.classList.remove('wallaby-cinema-items');
        container?.removeEventListener('click', intercept, true);
        container?.removeEventListener('keydown', keyboard, true);
        container?.querySelectorAll('.wallaby-cinema-selected').forEach(card => card.classList.remove('wallaby-cinema-selected'));
        container?.querySelectorAll('.wallaby-cinema-caption').forEach(node => node.remove());
        panel?.remove(); toggle?.remove(); container = panel = toggle = selected = null; selectedId = ''; lastQuery = '';
        document.body?.classList.remove('wallaby-library-active');
    }
    function position() {
        if (!panel || !container) return;
        const header = document.querySelector('.skinHeader');
        const top = Math.max((header?.getBoundingClientRect().bottom || 64) + 16, container.getBoundingClientRect().top);
        panel.style.top = `${Math.min(top, window.innerHeight * .4)}px`;
        const bounds = container.parentElement.getBoundingClientRect();
        panel.style.right = `${Math.max(24, window.innerWidth - bounds.right)}px`;
        panel.style.width = `${Math.max(300, bounds.width * .53)}px`;
    }
    function openItem(card) {
        const link = card.querySelector('a[href*="details"], a.itemAction[href], a[href]');
        if (link) { opening = true; try { link.click(); } finally { opening = false; } return; }
        // Uses Jellyfin's existing detail page if a non-anchor card renderer is selected.
        const params = new URLSearchParams({ id: card.dataset.id });
        const serverId = window.ApiClient?.serverId?.();
        if (serverId) params.set('serverId', serverId);
        location.hash = `#/details?${params}`;
    }
    const artwork = window.wallabyArtwork.createArtworkScheduler({
        load: url => new Promise((resolve, reject) => {
            const image = new Image(); image.alt = '';
            image.onload = async () => { try { await image.decode?.(); } catch (_) {} resolve(image); };
            image.onerror = reject; image.src = url;
        }),
        show: image => {
            if (!enabled || !container?.isConnected) return;
            if (!backdrop?.isConnected) {
                backdropPage = container.closest('.page') || container.parentElement;
                backdropPage.classList.add('wallaby-cinema-backdrop-page');
                backdrop = element('div', 'wallaby-cinema-wallpaper'); backdrop.setAttribute('aria-hidden', 'true');
                backdropPage.prepend(backdrop);
            }
            clearTimeout(fadeCleanup);
            const previous = [...backdrop.querySelectorAll('img')];
            previous.slice(0, -1).forEach(node => node.remove());
            const old = previous.at(-1);
            backdrop.append(image);
            // Commit the transparent start state before the next frame begins its fade.
            image.getBoundingClientRect();
            requestAnimationFrame(() => {
                if (!image.isConnected) return;
                image.classList.add('wallaby-art-visible'); old?.classList.remove('wallaby-art-visible');
            });
            fadeCleanup = setTimeout(() => { old?.remove(); backdrop?.classList.add('wallaby-fanart-ready'); }, 750);
        }
    });
    function clearBackdrop() {
        artwork.cancel(); clearTimeout(fadeCleanup);
        backdrop?.remove(); backdrop = null;
        backdropPage?.classList.remove('wallaby-cinema-backdrop-page'); backdropPage = null;
    }
    function showBackdrop(item, selectedAt) {
        const id = item.BackdropImageTags?.length ? item.Id : item.ParentBackdropItemId;
        const tag = item.BackdropImageTags?.[0] || item.ParentBackdropImageTags?.[0];
        const url = id && tag ? window.ApiClient.getImageUrl(id, { type: 'Backdrop', maxWidth: 2560, tag }) : window.jmpInfo?.branding?.homeBackdrop;
        if (url) artwork.select(url, Math.max(0, 1000 - (Date.now() - selectedAt)));
    }
    function mediaIcon(type) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 32 24'); svg.setAttribute('aria-hidden', 'true');
        svg.classList.add('wallaby-media-icon');
        const path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('d', type === 'screen' ? 'M3 3h26v16H3z M11 23h10 M16 19v4' :
            type === 'dolby' ? 'M2 3h12v18H2z M18 3h12v18H18z M4 5v14c10 0 10-14 0-14 M28 5v14c-10 0-10-14 0-14' :
            'M3 9h6l7-6v18l-7-6H3z M21 8q5 4 0 8 M25 4q10 8 0 16');
        svg.append(path); return svg;
    }
    function appendTechnicalDetails(copy, item) {
        const info = fileDetails(item);
        const section = element('section', 'wallaby-cinema-technical');
        section.setAttribute('aria-label', 'Media file details');
        if (info.hasFile) {
            const badges = element('div', 'wallaby-media-badges');
            for (const [kind, label, extra] of [['screen', info.video, info.dimensions],
                [info.dolby ? 'dolby' : 'speaker', info.audio, info.audioQuality]]) {
                if (!label) continue;
                const badge = element('div', 'wallaby-media-badge'); badge.title = extra || label;
                badge.append(mediaIcon(kind));
                const text = element('div', ''); text.append(element('strong', '', label));
                if (extra) text.append(element('small', '', extra)); badge.append(text); badges.append(badge);
            }
            section.append(badges);
            const subtitles = element('div', 'wallaby-cinema-subtitles');
            subtitles.append(element('span', 'wallaby-tech-label', 'Subtitles:'));
            for (const language of info.subtitles) {
                const badge = element('span', 'wallaby-language-badge', language.code);
                badge.title = language.name; badge.setAttribute('aria-label', language.name);
                const hue = [...language.name].reduce((value, letter) => (value * 31 + letter.charCodeAt(0)) % 360, 0);
                badge.style.setProperty('--language-hue', hue); subtitles.append(badge);
            }
            if (!info.subtitles.length) subtitles.append(element('span', 'wallaby-tech-value', 'None listed'));
            section.append(subtitles);
            if (info.sourceName) section.append(element('p', 'wallaby-file-note', `${info.sourceName} · open details to choose a version`));
            else if (info.audioTracks > 1) section.append(element('p', 'wallaby-file-note', `Default file audio shown · ${info.audioTracks} audio tracks available`));
        } else section.append(element('p', 'wallaby-file-note', item.Type === 'Series' ? 'Open an episode to see its file details.' : 'File details not provided by server.'));
        const language = element('p', 'wallaby-cinema-original-language');
        language.append(element('span', 'wallaby-tech-label', 'Original language:'), document.createTextNode(` ${info.originalLanguage}`));
        language.title = 'Original language from scraped title metadata, independent of audio tracks in the file';
        section.append(language); copy.append(section);
    }
    async function select(card) {
        if (!card || !enabled || selected === card) return;
        if (selectedId === card.dataset.id && panel?.children.length) { selected = card; card.classList.add('wallaby-cinema-selected'); return; }
        selected?.classList.remove('wallaby-cinema-selected'); selected = card; selectedId = card.dataset.id;
        const selectedAt = Date.now(); artwork.cancel();
        card.classList.add('wallaby-cinema-selected');
        const ticket = ++generation;
        panel.replaceChildren(element('p', 'wallaby-cinema-status', 'Loading details…'));
        try {
            const item = await window.ApiClient.getItem(window.ApiClient.getCurrentUserId(), card.dataset.id);
            if (ticket !== generation || !enabled || !panel?.isConnected) return;
            panel.replaceChildren();
            showBackdrop(item, selectedAt);
            const imageType = item.ImageTags?.Primary ? 'Primary' : item.BackdropImageTags?.length ? 'Backdrop' : null;
            if (imageType) {
                const image = element('img', `wallaby-cinema-art ${imageType === 'Backdrop' ? 'wallaby-cinema-backdrop' : ''}`);
                image.alt = `${item.Name || 'Selected title'} artwork`;
                image.src = window.ApiClient.getImageUrl(item.Id, { type: imageType, maxWidth: 900,
                    tag: imageType === 'Primary' ? item.ImageTags.Primary : item.BackdropImageTags[0] });
                image.addEventListener('error', () => image.remove(), { once: true });
                panel.append(image);
            }
            const copy = element('div', 'wallaby-cinema-copy');
            copy.append(element('h2', '', item.Name || 'Untitled'), element('p', 'wallaby-cinema-meta', metadata(item)));
            if (item.Genres?.length) copy.append(element('p', 'wallaby-cinema-genres', item.Genres.join(' · ')));
            // Treat server metadata as plain text, never executable HTML.
            copy.append(element('p', 'wallaby-cinema-overview', item.Overview || 'No description available.'));
            appendTechnicalDetails(copy, item);
            if (item.UserData?.Played) copy.append(element('p', 'wallaby-cinema-meta', 'Watched'));
            const open = element('button', 'wallaby-cinema-open', item.Type === 'Series' ? 'Open series & episodes' : 'Open details & playback');
            open.type = 'button'; open.addEventListener('click', () => openItem(card)); copy.append(open);
            panel.append(copy);
        } catch (_) {
            if (ticket !== generation || !panel?.isConnected) return;
            panel.replaceChildren(element('p', 'wallaby-cinema-status', 'Couldn’t load details. Check the server connection and try again.'));
            const retry = element('button', 'wallaby-cinema-open', 'Retry'); retry.type = 'button';
            retry.addEventListener('click', () => { selected = null; selectedId = ''; select(card); }); panel.append(retry);
        }
    }
    function intercept(event) {
        if (opening || !enabled || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const card = event.target.closest('.card[data-id], .listItem[data-id], .wallaby-cinema-row[data-id]');
        if (!card || !container.contains(card)) return;
        // Keep play, context menu, watched/favourite and selection controls native.
        if (event.target.closest('button, input, [data-action]:not([data-action="link"]), .cardOverlayButton')) return;
        event.preventDefault(); event.stopImmediatePropagation(); select(card);
    }
    function keyboard(event) {
        if (enabled && event.key === 'Enter' && selected && !event.target.closest('button, input, textarea, select')) { event.preventDefault(); event.stopImmediatePropagation(); openItem(selected); return; }
        if (!enabled || !['ArrowUp', 'ArrowDown'].includes(event.key) || event.target.closest('input, textarea, select, button')) return;
        const rows = cards().filter(visible); const index = rows.indexOf(selected);
        const next = rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
        if (next) { event.preventDefault(); event.stopImmediatePropagation(); (next.querySelector('a[href], [tabindex]') || next).focus({ preventScroll: true }); select(next); next.scrollIntoView({ block: 'nearest' }); }
    }
    function render() {
        if (container.classList.contains('wallaby-cinema-items') !== enabled) container.classList.toggle('wallaby-cinema-items', enabled);
        toggle.setAttribute('aria-pressed', String(enabled));
        setText(toggle, enabled ? 'Standard library view' : 'Cinema list');
        if (!document.body?.classList.contains('wallaby-library-active')) document.body?.classList.add('wallaby-library-active');
        if (!enabled) { if (backdrop || panel) { clearBackdrop(); generation++; } panel?.remove(); panel = selected = null; selectedId = '';
            window.wallabyLibraryPaging?.attach(container, select, openItem, { mode: 'native' });
            container.querySelectorAll('.wallaby-cinema-caption').forEach(node => node.remove()); return; }
        if (!panel) {
            panel = element('aside', 'wallaby-cinema-detail'); panel.setAttribute('aria-label', 'Selected title details');
            panel.setAttribute('aria-live', 'polite'); container.after(panel);
        }
        window.wallabyLibraryPaging?.attach(container, select, openItem, { mode: 'cinema' });
        const query = window.wallabyLibraryPaging?.queryKey();
        if (query && lastQuery && query !== lastQuery) { selected = null; selectedId = ''; }
        if (query) lastQuery = query;
        const current = cards().find(card => card.dataset.id === selectedId && visible(card));
        if (current) { selected = current; current.classList.add('wallaby-cinema-selected'); }
        if (!selectedId) { selected = null; select(cards().find(visible)); }
        if (!cards().length && !selectedId) {
            const status = window.wallabyLibraryPaging?.status();
            setText(panel, status?.total === 0 ? 'No titles in this view. Try changing Jellyfin’s filters.' : 'Loading titles…');
        }
        position();
    }
    function sync() {
        const client = window.ApiClient;
        const library = libraryRoute(location.hash);
        const user = client?.getCurrentUserId?.();
        const nextKey = library && user ? `wallaby.cinema.${client.serverAddress()}.${user}.${library}` : '';
        // Never apply to dashboard, search, home, genre shelves or playback overlays.
        const candidates = nextKey ? [...document.querySelectorAll('.itemsContainer')].filter(node => visible(node) && node.querySelector('.card[data-id], .listItem[data-id]') &&
            !node.closest('.horizontalItemsContainer, .scrollSlider, .hide, [hidden]')) : [];
        const next = candidates.sort((a, b) => b.querySelectorAll('.card[data-id], .listItem[data-id]').length - a.querySelectorAll('.card[data-id], .listItem[data-id]').length)[0] ||
            (container?.isConnected && visible(container) && key === nextKey ? container : null);
        if (!nextKey || !next) { if (container && (!nextKey || !container.isConnected)) cleanup(); return; }
        if (container !== next || key !== nextKey) {
            cleanup(); container = next; key = nextKey;
            try { enabled = localStorage.getItem(key) === 'cinema'; } catch (_) { enabled = false; }
            toggle = element('button', 'wallaby-cinema-toggle'); toggle.type = 'button';
            toggle.addEventListener('click', () => { enabled = !enabled; remember(enabled); render(); });
            container.before(toggle);
            container.addEventListener('click', intercept, true); container.addEventListener('keydown', keyboard, true);
        }
        render();
    }
    function schedule(records) {
        if (Array.isArray(records) && records.every(record => record.target.closest?.('.wallaby-cinema-detail, .wallaby-cinema-toggle, .wallaby-cinema-caption, .wallaby-virtual-library'))) return;
        if (scheduled) return; scheduled = true;
        requestAnimationFrame(() => { scheduled = false; sync(); });
    }
    function start() {
        new MutationObserver(records => schedule(records)).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        window.addEventListener('hashchange', () => { cleanup(); schedule(); });
        window.addEventListener('wallaby-library-query', () => schedule());
        window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
        window.addEventListener('focus', () => schedule()); setInterval(() => schedule(), 5000); schedule();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
