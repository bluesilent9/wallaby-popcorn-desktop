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
    let container, panel, selected, backdrop, backdropPage, selectedId = '', lastQuery = '', selectedIndex = 0, fadeCleanup, key = '', enabled = false, generation = 0, scheduled = false, opening = false;
    const visible = node => node && node.getClientRects().length && !node.closest('.hide, [hidden], [aria-hidden="true"]');
    const cards = () => container ? [...container.querySelectorAll('.card[data-id], .listItem[data-id], .wallaby-cinema-row[data-id]')] : [];
    const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
    function element(tag, className, text) {
        const node = document.createElement(tag); node.className = className;
        if (text) node.textContent = text;
        return node;
    }
    // Retain the existing key/values: historical 'cinema' is the new Standard View.
    // Native Grid/List settings remain owned and persisted by Jellyfin.
    function remember(value) { try { localStorage.setItem(key, value ? 'cinema' : 'standard'); } catch (_) {} }
    function cleanup() {
        generation++;
        clearBackdrop();
        window.wallabyLibraryPaging?.reset();
        container?.classList.remove('wallaby-cinema-items');
        container?.removeEventListener('click', intercept, true);
        container?.removeEventListener('focusin', focusTitle);
        container?.removeEventListener('pointerover', hover);
        container?.classList.remove('wallaby-library-viewport');
        document.querySelectorAll('.wallaby-library-shell').forEach(node => node.classList.remove('wallaby-library-shell'));
        window.wallabyLibrary = null;
        container?.querySelectorAll('.wallaby-cinema-selected').forEach(card => card.classList.remove('wallaby-cinema-selected'));
        container?.querySelectorAll('.wallaby-cinema-caption').forEach(node => node.remove());
        panel?.remove(); container = panel = selected = null;
        document.querySelectorAll('.wallaby-standard-view').forEach(node => node.remove());
        document.querySelectorAll('.wallaby-native-view-overridden').forEach(node => node.classList.remove('wallaby-native-view-overridden')); selectedId = ''; lastQuery = '';
        document.body?.classList.remove('wallaby-library-active');
    }
    const boundViewRows = new WeakSet();
    function syncViewMenu() {
        if (!container || !libraryRoute(location.hash)) return;
        const menu = document.querySelector('#selectview-popover [role="menu"]');
        if (!menu) return;
        // Only direct Grid/List rows; nested image settings and the gear stay native.
        const rows = [...menu.children].filter(node => node.getAttribute('role') === 'menuitem' && !node.classList.contains('wallaby-standard-view'));
        if (rows.length !== 2) return;
        for (const row of rows) {
            if (row.classList.contains('wallaby-native-view-overridden') !== enabled) row.classList.toggle('wallaby-native-view-overridden', enabled);
            if (!boundViewRows.has(row)) {
                boundViewRows.add(row);
                row.addEventListener('click', event => {
                    if (event.target.closest('button, [role="button"]')) return;
                    enabled = false; remember(false); render();
                }, true);
            }
        }
        let choice = menu.querySelector(':scope > .wallaby-standard-view');
        if (!choice) {
            choice = element('li', rows[0].className.replace('wallaby-native-view-overridden', '').replace('Mui-selected', '') + ' wallaby-standard-view');
            choice.setAttribute('role', 'menuitem'); choice.tabIndex = -1;
            choice.append(element('span', 'wallaby-view-check'), element('span', '', 'Standard View'));
            choice.firstElementChild.setAttribute('aria-hidden', 'true');
            const activate = event => { event.preventDefault(); event.stopPropagation(); enabled = true; remember(true); render(); choice.focus({ preventScroll: true }); };
            choice.addEventListener('click', activate);
            choice.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') activate(event); });
            menu.append(choice);
        }
        setText(choice.firstElementChild, enabled ? '✓' : '');
        if (choice.classList.contains('Mui-selected') !== enabled) choice.classList.toggle('Mui-selected', enabled);
    }
    function prepareToolbar() {
        const toolbar = document.querySelector('.MuiAppBar-root > .MuiToolbar-root:nth-child(2)') || document.querySelector('.toolbar');
        if (toolbar && !toolbar.classList.contains('wallaby-library-toolbar')) toolbar.classList.add('wallaby-library-toolbar');
    }
    function position() {
        if (!container) return;
        prepareToolbar();
        const toolbar = [...document.querySelectorAll('.MuiToolbar-root.padded-left.padded-right, .libraryPage .pageTabContent .sectionTitleContainer, .toolbar')].filter(visible);
        const top = Math.min(innerHeight * .35, Math.max(56, ...toolbar.map(node => node.getBoundingClientRect().bottom)) + 12);
        document.body.style.setProperty('--wallaby-library-top', `${top}px`);
        const bounds = container.parentElement.getBoundingClientRect();
        const left = Math.max(24, bounds.left), width = Math.max(300, Math.min(innerWidth - left - 24, bounds.width || innerWidth - left * 2));
        container.style.setProperty('--wallaby-list-left', `${left}px`);
        container.style.setProperty('--wallaby-list-width', `${enabled ? width * .43 : width}px`);
        if (panel) {
            panel.style.top = `${top}px`; panel.style.right = `${Math.max(24, innerWidth - bounds.right)}px`;
            panel.style.width = `${Math.max(280, width * .53)}px`;
        }
    }
    function openItem(card) {
        window.wallabyNavigation?.remember();
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
            for (const [kind, label, extra] of [['screen', info.video, ''],
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
        selectedIndex = Number(card.dataset.wallabyIndex || 0);
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
        event.preventDefault(); event.stopImmediatePropagation(); select(card); openItem(card);
    }
    const rowSelector = '.wallaby-cinema-row[data-id], .wallaby-virtual-card[data-id]';
    function focusTitle(event) {
        const row = event.target.closest(rowSelector);
        if (!row || !container.contains(row)) return;
        selectedIndex = Number(row.dataset.wallabyIndex || 0);
        if (enabled) select(row);
        else { selectedId = row.dataset.id; selected = row; }
    }
    function hover(event) {
        if (event.pointerType === 'touch') return;
        const control = event.target.closest('button, a, input, select, [tabindex]');
        const row = event.target.closest(rowSelector);
        const target = control || row;
        if (target && visible(target) && document.activeElement !== target) target.focus({ preventScroll: true });
        if (row && enabled) select(row);
    }
    function arrow(key) {
        if (!container?.isConnected) return false;
        const active = document.activeElement;
        const row = active?.closest(rowSelector);
        if (!active || active === document.body || active === document.documentElement || !visible(active)) {
            window.wallabyLibraryPaging?.focusIndex(selectedIndex); return true;
        }
        if (row && (key === 'ArrowUp' || key === 'ArrowDown')) {
            window.wallabyLibraryPaging?.focusIndex(Number(row.dataset.wallabyIndex) + (key === 'ArrowDown' ? 1 : -1)); return true;
        }
        const controls = [...document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [tabindex="0"]')].filter(node =>
            visible(node) && !node.disabled && !node.closest('.wallaby-virtual-library, .skinHeader, [role="dialog"], .mainDrawer') &&
            !node.classList.contains('wallaby-cinema-paging-hidden') && !node.closest('.MuiAppBar-root > .MuiToolbar-root:first-child'));
        const remembered = cards().find(node => Number(node.dataset.wallabyIndex) === selectedIndex && visible(node)) || cards().find(visible);
        const zones = [...controls]; if (remembered) zones.push(remembered);
        const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
        const forward = key === 'ArrowRight' || key === 'ArrowDown';
        const origin = (row || active).getBoundingClientRect();
        const center = r => [r.left + r.width / 2, r.top + r.height / 2]; const point = center(origin);
        const candidates = zones.filter(node => node !== active && node !== row).map(node => {
            const p = center(node.getBoundingClientRect()), dx = p[0] - point[0], dy = p[1] - point[1];
            const primary = horizontal ? dx : dy, secondary = horizontal ? dy : dx;
            return { node, primary: primary * (forward ? 1 : -1), score: Math.abs(primary) + Math.abs(secondary) * 2 };
        }).filter(entry => entry.primary > 1).sort((a,b) => a.score - b.score);
        const target = candidates[0]?.node || (row ? controls[forward ? 0 : controls.length - 1] : remembered);
        if (target === remembered) window.wallabyLibraryPaging?.focusIndex(selectedIndex);
        else target?.focus({ preventScroll: true });
        return true; // Never let browsing arrows scroll the page itself.
    }
    function render() {
        if (container.classList.contains('wallaby-cinema-items') !== enabled) container.classList.toggle('wallaby-cinema-items', enabled);
        syncViewMenu();
        if (!document.body?.classList.contains('wallaby-library-active')) document.body?.classList.add('wallaby-library-active');
        if (!enabled) { if (backdrop || panel) { clearBackdrop(); generation++; } panel?.remove(); panel = selected = null; selectedId = '';
            window.wallabyLibraryPaging?.attach(container, select, openItem, { mode: 'native' });
            container.querySelectorAll('.wallaby-cinema-caption').forEach(node => node.remove()); position(); restore(); return; }
        if (!panel) {
            panel = element('aside', 'wallaby-cinema-detail'); panel.setAttribute('aria-label', 'Selected title details');
            panel.setAttribute('aria-live', 'polite'); panel.addEventListener('pointerover', hover); container.after(panel);
        }
        window.wallabyLibraryPaging?.attach(container, select, openItem, { mode: 'cinema' });
        const query = window.wallabyLibraryPaging?.queryKey();
        if (query && lastQuery && query !== lastQuery) { selected = null; selectedId = ''; }
        if (query) lastQuery = query;
        const current = cards().find(card => card.dataset.id === selectedId && visible(card));
        if (current) { selected = current; current.classList.add('wallaby-cinema-selected'); }
        if (!selectedId && !window.wallabyNavigation?.pending(location.hash)) { selected = null; select(cards().find(visible)); }
        if (!cards().length && !selectedId) {
            const status = window.wallabyLibraryPaging?.status();
            setText(panel, status?.total === 0 ? 'No titles in this view. Try changing Jellyfin’s filters.' : 'Loading titles…');
        }
        position(); restore();
    }
    function restore() {
        const state = window.wallabyNavigation?.pending(location.hash);
        if (!state || !window.wallabyLibraryPaging?.queryKey()) return;
        selectedIndex = state.index; selectedId = ''; selected = null; container.scrollTop = state.scrollTop;
        window.wallabyNavigation.restored();
        window.wallabyLibraryPaging.focusIndex(selectedIndex);
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
            container.classList.add('wallaby-library-viewport');
            for (let node = container.parentElement; node && node !== document.body; node = node.parentElement) node.classList.add('wallaby-library-shell');
            container.addEventListener('click', intercept, true); container.addEventListener('focusin', focusTitle);
            container.addEventListener('pointerover', hover);
            window.wallabyLibrary = { arrow, snapshot: () => ({ hash: location.hash, id: selectedId, index: selectedIndex, scrollTop: container.scrollTop }) };
        }
        render();
    }
    function schedule(records) {
        if (Array.isArray(records) && records.every(record => record.target.closest?.('.wallaby-cinema-detail, .wallaby-standard-view, .wallaby-cinema-caption, .wallaby-virtual-library'))) return;
        if (scheduled) return; scheduled = true;
        requestAnimationFrame(() => { scheduled = false; sync(); });
    }
    function start() {
        new MutationObserver(records => schedule(records)).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        window.addEventListener('hashchange', () => { cleanup(); schedule(); });
        window.addEventListener('wallaby-library-query', () => schedule());
        window.addEventListener('resize', position);
        document.addEventListener('pointerover', event => {
            if (container?.isConnected && libraryRoute(location.hash) && !event.target.closest('[role="dialog"], [role="menu"]')) hover(event);
        });
        window.addEventListener('focus', () => schedule()); setInterval(() => schedule(), 5000); schedule();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
