const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dependency=process.env.WALLABY_JSDOM;const source=name=>fs.readFileSync(path.join(__dirname,'../native',name),'utf8');
test('Home keeps the original server/account buttons and displays the logged-in name for non-admin users',{skip:!dependency},async t=>{
 const {JSDOM}=require(dependency),dom=new JSDOM('<header class="MuiAppBar-root"><div class="MuiToolbar-root"><div class="MuiStack-root"><a id="server" href="#/"><img alt="Wallaby">calder.vip</a><a id="favourites" href="#/home?tab=1">Favourites</a><a id="movies" href="#/movies">Movies</a><a id="tv" href="#/tv">TV Shows</a></div><button id="account" aria-controls="app-user-menu"><span class="MuiAvatar-root">Icon</span></button></div></header>',{url:'http://[::1]:8096/web/#/home',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window;
 w.wallabyNavigation={isHome:hash=>hash==='#/home'};w.ApiClient={serverAddress:()=>w.location.origin,getCurrentUserId:()=> 'user',getCurrentUser:async()=>({Name:'Dave',Policy:{IsAdministrator:false}})};
 const original=w.document.getElementById('account');let opened=0;original.onclick=()=>opened++;
 w.eval(source('wallaby-desktop.js'));await new Promise(r=>setTimeout(r,80));
 assert.equal(w.document.getElementById('server').classList.contains('wallaby-home-nav-hidden'),false);
 for(const id of ['favourites','movies','tv'])assert.equal(w.document.getElementById(id).classList.contains('wallaby-home-nav-hidden'),true);
 assert.equal(w.document.querySelector('.wallaby-user-name').textContent,'Dave');assert.ok(original.querySelector('.MuiAvatar-root'));w.document.querySelector('.wallaby-user-name').click();assert.equal(opened,1);assert.equal(w.document.getElementById('account'),original);
 assert.equal(w.document.getElementById('wallaby-manage-server'),null,'styling must not grant admin permission');
 w.location.hash='#/movies?topParentId=movies';await new Promise(r=>setTimeout(r,80));assert.equal(w.document.querySelector('.wallaby-user-name'),null);
});
test('Home fades only a fixed header strip and leaves tall scrolling content unmasked',{skip:!dependency},async t=>{
 const {JSDOM}=require(dependency),dom=new JSDOM('<header class="skinHeader">Server</header><main style="height:12000px"><div>Movie cards</div><div id="bottom">Last shelf</div></main>',{url:'http://[::1]:8096/web/#/home',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window;let top=64;
 w.HTMLElement.prototype.getBoundingClientRect=function(){return this.tagName==='HEADER'?{top:0,bottom:64}:{top,bottom:top+12000}};
 w.wallabyNavigation={isHome:hash=>hash==='#/home'};w.eval(source('wallaby-artwork.js'));w.eval(source('wallaby-home.js'));const tick=()=>new Promise(r=>setTimeout(r,40));await tick();
 const style=w.document.createElement('style');style.textContent=source('wallaby-popcorn.css');w.document.head.append(style);await tick();
 const main=w.document.querySelector('main'),strip=w.document.querySelector('.wallaby-home-header-fade');
 assert.ok(strip);assert.equal(strip.parentElement,w.document.body);assert.equal(strip.style.height,'84px');
 assert.equal(w.getComputedStyle(strip).position,'fixed');assert.ok(w.getComputedStyle(strip).maskImage.includes('linear-gradient'));
 assert.ok(!main.classList.contains('wallaby-home-content-fade'));
 for(const node of [main,...main.querySelectorAll('*')]){
  const css=w.getComputedStyle(node);assert.ok(!css.maskImage||css.maskImage==='none');
  assert.ok(!css.transform||css.transform==='none');
 }
 const changes=[];new w.MutationObserver(records=>changes.push(...records)).observe(strip,{attributes:true,subtree:true,childList:true});
 for(const offset of [-200,-1800,-9000]){top=offset;w.dispatchEvent(new w.Event('scroll'));await tick();assert.equal(strip.style.height,'84px');}
 assert.equal(changes.length,0,'wheel scrolling must not rewrite the fade or shift wallpaper');
 assert.equal(main.style.height,'12000px');assert.ok(w.document.getElementById('bottom').isConnected);
 w.location.hash='#/movies';await tick();assert.equal(w.document.querySelector('.wallaby-home-header-fade'),null);
 w.location.hash='#/home';await tick();assert.equal(w.document.querySelectorAll('.wallaby-home-header-fade').length,1);
});
