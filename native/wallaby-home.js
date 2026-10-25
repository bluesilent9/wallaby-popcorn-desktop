/* Home keeps native hover controls; settled movie hover changes only its wallpaper. */
(() => {
    const isLibraryItem = item => ['collectionfolder', 'userview', 'folder'].includes(String(item?.Type || '').toLowerCase()) || !!item?.CollectionType;
    if (typeof module !== 'undefined' && module.exports) module.exports = { isLibraryItem };
    if (typeof window === 'undefined') return;
    let surface, headerFade, headerWallpaper, hovered = null, generation = 0, cleanup;
    const home = () => window.wallabyNavigation?.isHome(location.hash);
    const fallback = () => window.jmpInfo?.branding?.homeBackdrop;
    const scheduler = window.wallabyArtwork.createArtworkScheduler({
        load: url => new Promise((resolve,reject) => {
            const image = new Image(); image.alt = ''; image.onload = async () => { try { await image.decode?.(); } catch (_) {} resolve(image); };
            image.onerror = reject; image.src = url;
        }),
        show: image => {
            if (!home()) return;
            if (!surface?.isConnected) {
                surface = document.createElement('div'); surface.className = 'wallaby-home-wallpaper'; surface.setAttribute('aria-hidden','true'); document.body.prepend(surface);
            }
            clearTimeout(cleanup);
            const images = [...surface.querySelectorAll('img')]; images.slice(0,-1).forEach(node=>node.remove());
            updateHeaderFade();
            const old = images.at(-1), oldHeader = headerWallpaper?.lastElementChild;
            headerWallpaper?.querySelectorAll('img').forEach(node => { if (node !== oldHeader) node.remove(); });
            const headerImage = image.cloneNode(true);
            surface.append(image); headerWallpaper?.append(headerImage); image.getBoundingClientRect(); headerImage.getBoundingClientRect();
            requestAnimationFrame(()=>{ if (image.isConnected) {
                image.classList.add('wallaby-art-visible'); headerImage.classList.add('wallaby-art-visible');
                old?.classList.remove('wallaby-art-visible'); oldHeader?.classList.remove('wallaby-art-visible');
            } });
            cleanup = setTimeout(()=>{ old?.remove(); oldHeader?.remove(); },750);
        }
    });
    async function choose(card) {
        if (hovered === card) return;
        hovered = card; const ticket = ++generation, selectedAt = Date.now(); scheduler.cancel();
        if (!card || isLibraryItem({Type:card.dataset.type,CollectionType:card.dataset.collectiontype})) { if (fallback()) scheduler.select(fallback(),Math.max(0,1000-(Date.now()-selectedAt))); return; }
        try {
            const client = window.ApiClient, user = client?.getCurrentUserId?.();
            if (!user) return;
            const item = await client.getItem(user,card.dataset.id);
            if (ticket !== generation || !home()) return;
            if (isLibraryItem(item)) { if (fallback()) scheduler.select(fallback(),Math.max(0,1000-(Date.now()-selectedAt))); return; }
            const id = item.BackdropImageTags?.length ? item.Id : item.ParentBackdropItemId;
            const tag = item.BackdropImageTags?.[0] || item.ParentBackdropImageTags?.[0];
            const url = id && tag ? client.getImageUrl(id,{type:'Backdrop',maxWidth:2560,tag}) : fallback();
            if (url) scheduler.select(url,Math.max(0,1000-(Date.now()-selectedAt)));
        } catch (_) { /* Keep the loaded wallpaper while the connection recovers. */ }
    }
    let fadeQueued = false;
    function updateHeaderFade() {
        fadeQueued = false;
        if (!home()) { headerFade?.remove(); headerFade = headerWallpaper = null; return; }
        // Never mask/transform the scrolling page: Chromium can clip that huge layer
        // to its initial raster bounds. Only this small, fixed overlay is masked.
        const header = document.querySelector('.MuiAppBar-root > .MuiToolbar-root:first-child') || document.querySelector('.skinHeader');
        if (!header) return;
        if (!headerFade?.isConnected) {
            headerFade = document.createElement('div'); headerFade.className = 'wallaby-home-header-fade'; headerFade.setAttribute('aria-hidden','true');
            headerWallpaper = document.createElement('div'); headerWallpaper.className = 'wallaby-home-header-wallpaper';
            surface?.querySelectorAll('img').forEach(image => headerWallpaper.append(image.cloneNode(true)));
            headerFade.append(headerWallpaper); document.body.append(headerFade);
        }
        const height = `${Math.max(0, header.getBoundingClientRect().bottom) + 20}px`;
        if (headerFade.style.height !== height) headerFade.style.height = height;
    }
    function scheduleFade() { if (!fadeQueued) { fadeQueued = true; requestAnimationFrame(updateHeaderFade); } }
    // Scrolling no longer rewrites a mask or shifts the artwork every frame.
    window.addEventListener('resize', scheduleFade);
    new MutationObserver(scheduleFade).observe(document.documentElement, { childList:true, subtree:true });
    window.addEventListener('hashchange', scheduleFade); scheduleFade();
    document.addEventListener('pointerover',event=>{
        if (!home() || event.pointerType === 'touch') return;
        choose(event.target.closest?.('.card[data-id], .listItem[data-id]') || null);
    });
    document.addEventListener('pointerout',event=>{
        if (!home()) return;
        choose(event.relatedTarget?.closest?.('.card[data-id], .listItem[data-id]') || null);
    });
    window.addEventListener('blur',()=>{if(home()) choose(null);});
    window.addEventListener('hashchange',()=>{
        generation++; hovered = null; scheduler.cancel(); clearTimeout(cleanup); surface?.remove(); surface=null; headerFade?.remove(); headerFade=headerWallpaper=null; scheduleFade();
    });
})();
