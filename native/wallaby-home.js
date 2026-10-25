/* Home keeps native hover controls; settled movie hover changes only its wallpaper. */
(() => {
    const isLibraryItem = item => ['collectionfolder', 'userview', 'folder'].includes(String(item?.Type || '').toLowerCase()) || !!item?.CollectionType;
    if (typeof module !== 'undefined' && module.exports) module.exports = { isLibraryItem };
    if (typeof window === 'undefined') return;
    let surface, hovered = null, generation = 0, cleanup;
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
            const old = images.at(-1); surface.append(image); image.getBoundingClientRect();
            requestAnimationFrame(()=>{ if (image.isConnected) { image.classList.add('wallaby-art-visible'); old?.classList.remove('wallaby-art-visible'); } });
            cleanup = setTimeout(()=>old?.remove(),750);
        }
    });
    async function choose(card) {
        if (hovered === card) return;
        hovered = card; const ticket = ++generation, selectedAt = Date.now(); scheduler.cancel();
        if (!card || isLibraryItem({Type:card.dataset.type,CollectionType:card.dataset.collectiontype})) { if (fallback()) scheduler.select(fallback(),0); return; }
        try {
            const client = window.ApiClient, user = client?.getCurrentUserId?.();
            if (!user) return;
            const item = await client.getItem(user,card.dataset.id);
            if (ticket !== generation || !home()) return;
            if (isLibraryItem(item)) { if (fallback()) scheduler.select(fallback(),0); return; }
            const id = item.BackdropImageTags?.length ? item.Id : item.ParentBackdropItemId;
            const tag = item.BackdropImageTags?.[0] || item.ParentBackdropImageTags?.[0];
            const url = id && tag ? client.getImageUrl(id,{type:'Backdrop',maxWidth:2560,tag}) : fallback();
            if (url) scheduler.select(url,Math.max(0,1000-(Date.now()-selectedAt)));
        } catch (_) { /* Keep the loaded wallpaper while the connection recovers. */ }
    }
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
        generation++; hovered = null; scheduler.cancel(); clearTimeout(cleanup); surface?.remove(); surface=null;
    });
})();
