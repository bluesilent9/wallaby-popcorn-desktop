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
test('Home masks scrolling content behind the header, leaving header and wallpaper unmasked',{skip:!dependency},async t=>{
 const {JSDOM}=require(dependency),dom=new JSDOM('<header class="skinHeader">Server</header><main><div>Movie cards</div></main>',{url:'http://[::1]:8096/web/#/home',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window;let top=64;
 w.HTMLElement.prototype.getBoundingClientRect=function(){return this.tagName==='HEADER'?{top:0,bottom:64}:{top,bottom:900}};
 w.wallabyNavigation={isHome:hash=>hash==='#/home'};w.eval(source('wallaby-artwork.js'));w.eval(source('wallaby-home.js'));const tick=()=>new Promise(r=>setTimeout(r,40));await tick();
 const main=w.document.querySelector('main');assert.ok(main.classList.contains('wallaby-home-content-fade'));assert.equal(main.style.getPropertyValue('--wallaby-fade-start'),'0px');
 top=-200;w.dispatchEvent(new w.Event('scroll'));await tick();assert.equal(main.style.getPropertyValue('--wallaby-fade-start'),'244px');assert.equal(main.style.getPropertyValue('--wallaby-fade-end'),'284px');assert.ok(!w.document.querySelector('header').classList.contains('wallaby-home-content-fade'));
 w.location.hash='#/movies';await tick();assert.ok(!main.classList.contains('wallaby-home-content-fade'));
});
