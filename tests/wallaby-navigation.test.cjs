const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const dependency=process.env.WALLABY_JSDOM;
const source=name=>fs.readFileSync(path.join(__dirname,'../native',name),'utf8');
test('Escape follows library → Home → exit, details return keeps the originating title, dialogs retain Escape',{skip:!dependency},async t=>{
 const {JSDOM}=require(dependency);const dom=new JSDOM('<body><button id="filter">Filter</button></body>',{url:'http://[::1]:8096/web/#/movies?topParentId=movies',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 w.HTMLElement.prototype.getClientRects=()=>[{}];let exits=0,arrows=[];
 w.api={system:{exit:()=>exits++}};w.ApiClient={serverAddress:()=>w.location.origin,getCurrentUserId:()=> 'user'};
 w.wallabyLibrary={snapshot:()=>({hash:w.location.hash,index:170,id:'movie-170',scrollTop:10800}),arrow:key=>{arrows.push(key);return true;}};
 w.eval(source('wallaby-navigation.js'));w.wallabyNavigation.remember();w.location.hash='#/details?id=movie-170';await new Promise(r=>w.setTimeout(r,0));
 assert.equal(w.wallabyNavigation.command('back'),true);assert.equal(w.location.hash,'#/movies?topParentId=movies');
 assert.equal(w.wallabyNavigation.pending(w.location.hash).index,170);assert.equal(w.wallabyNavigation.pending(w.location.hash).scrollTop,10800);
 for(const key of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']) {const event=new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});w.document.body.dispatchEvent(event);assert.equal(event.defaultPrevented,true);}
 assert.deepEqual(arrows,['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
 const dialog=w.document.createElement('div');dialog.setAttribute('role','dialog');w.document.body.append(dialog);assert.equal(w.wallabyNavigation.command('back'),false);dialog.remove();
 assert.equal(w.wallabyNavigation.command('back'),true);assert.equal(w.location.hash,'#/home');assert.equal(exits,0);
 assert.equal(w.wallabyNavigation.command('back'),true);assert.equal(exits,1);
});
test('desktop backslash shortcut and native input routing are present without a long-Escape exit action',()=>{
 const qml=fs.readFileSync(path.join(__dirname,'../src/ui/webview.qml'),'utf8');assert.ok(qml.includes('shortcut: "\\\\"'));
 const mapping=fs.readFileSync(path.join(__dirname,'../resources/inputmaps/keyboard.json'),'utf8');assert.ok(mapping.includes('"Esc": "back"'));assert.ok(!mapping.includes('(Esc|Backspace)'));
 assert.ok(source('inputPlugin.js').includes('window.wallabyNavigation?.command(action)'));
});

test('title focus, hover, controls and remembered rows navigate without scrolling the page, including unloaded batches',{skip:!dependency},async t=>{
 const {JSDOM}=require(dependency);const dom=new JSDOM('<body><main class="page"><div class="toolbar"><button id="filter">Filter</button><button id="sort">Sort</button></div><div class="itemsContainer"></div></main></body>',{url:'http://[::1]:8096/web/#/movies?topParentId=movies',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window,list=w.document.querySelector('.itemsContainer');
 Object.defineProperty(list,'clientHeight',{value:400});
 const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
 w.HTMLElement.prototype.getBoundingClientRect=function(){
  if(this===list)return rect(30,150,400,400);
  if(this.classList.contains('wallaby-virtual-library'))return rect(30,150-list.scrollTop,400,400);
  if(this.dataset.wallabyIndex!==undefined)return rect(30,150+Number(this.dataset.wallabyIndex)*64-list.scrollTop,400,64);
  if(this.classList.contains('wallaby-cinema-open'))return rect(550,500,220,50);
  if(this.id==='filter')return rect(30,20,100,40);if(this.id==='sort')return rect(170,20,100,40);
  return rect(0,0,1000,100);
 };
 w.HTMLElement.prototype.getClientRects=function(){return this.closest('[data-wallaby-original-id]') ? [] : [this.getBoundingClientRect()]};w.performance.getEntriesByType=()=>[];
 const all=Array.from({length:171},(_,i)=>({Id:`m${i}`,Name:`Movie ${i}`,Type:'Movie',MediaStreams:[{Type:'Video',Codec:'h264',Width:1280,Height:682},{Type:'Audio',Codec:'aac',Channels:2,BitRate:116000,SampleRate:48000}]}));
 w.ApiClient={getCurrentUserId:()=> 'user',serverAddress:()=>w.location.origin,serverId:()=> 'server',getItems:async(user,q)=>({Items:all.slice(q.StartIndex||0,(q.StartIndex||0)+Number(q.Limit)),TotalRecordCount:171}),getItem:async(user,id)=>all.find(i=>i.Id===id)};
 w.localStorage.setItem(`wallaby.cinema.${w.location.origin}.user.movies`,'cinema');
 for(const name of ['wallaby-library-paging.js','wallaby-artwork.js','wallaby-navigation.js','wallaby-library.js'])w.eval(source(name));
 const render=async()=>{const result=await w.ApiClient.getItems('user',{ParentId:'movies',IncludeItemTypes:'Movie',Limit:100});list.innerHTML=result.Items.map(item=>`<div class="card" data-id="${item.Id}"><a href="#/details?id=${item.Id}"><div class="cardText">${item.Name}</div></a></div>`).join('');};
 const tick=()=>new Promise(r=>setTimeout(r,80));await render();await tick();assert.equal(w.document.querySelector('.wallaby-cinema-toggle'),null);assert.ok(w.document.querySelector('.toolbar').classList.contains('wallaby-library-toolbar'));
 const key=value=>{const event=new w.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true});w.document.activeElement.dispatchEvent(event);assert.equal(event.defaultPrevented,true);};
 key('ArrowDown');assert.equal(w.document.activeElement.dataset.id,'m0');key('ArrowDown');assert.equal(w.document.activeElement.dataset.id,'m1');await tick();
 key('ArrowRight');assert.equal(w.document.activeElement.className,'wallaby-cinema-open');
 key('ArrowLeft');assert.notEqual(w.document.activeElement.className,'wallaby-cinema-open');
 const hovered=list.querySelector('[data-id="m7"]');hovered.dispatchEvent(new w.MouseEvent('pointerover',{bubbles:true}));await tick();assert.equal(w.document.activeElement.dataset.id,'m7');assert.equal(w.document.querySelector('.wallaby-cinema-copy h2').textContent,'Movie 7');
 w.document.activeElement.blur();key('ArrowDown');assert.equal(w.document.activeElement.dataset.id,'m7','first arrow restores remembered title without advancing');
 w.document.getElementById('filter').focus();key('ArrowDown');assert.notEqual(w.document.activeElement.id,'filter');assert.equal(w.scrollY,0);
 w.wallabyLibraryPaging.focusIndex(170);await tick();await tick();assert.equal(w.document.activeElement.dataset.id,'m170');assert.equal(w.wallabyLibrary.snapshot().index,170);
 const video=w.document.querySelector('.wallaby-media-badge');assert.equal(video.textContent,'720p · H.264');assert.ok(!video.textContent.includes('1280'));assert.ok(w.document.querySelectorAll('.wallaby-media-badge')[1].textContent.includes('116 kb/s'));
 w.document.querySelector('.wallaby-cinema-row[data-id="m170"] .wallaby-cinema-name').click();await tick();assert.ok(w.location.hash.includes('details'));w.wallabyNavigation.command('back');await tick();await render();await tick();await tick();assert.equal(w.document.activeElement.dataset.id,'m170','Escape restores the previous title beyond the first batch');
 assert.equal(w.scrollY,0);assert.ok(list.classList.contains('wallaby-library-viewport'));
});

test('Home hover waits before fanart and returns to Wallaby artwork after leaving a title',{skip:!dependency},async t=>{
 const {JSDOM}=require(dependency);const dom=new JSDOM('<body><header class="skinHeader"></header><div class="card" data-id="film"></div><div class="card library" data-id="movies" data-type="CollectionFolder"></div></body>',{url:'http://[::1]:8096/web/#/home',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window,tasks=[];
 w.setTimeout=(fn,delay)=>{const task={fn,delay};tasks.push(task);return task;};w.clearTimeout=task=>{if(task)task.cancelled=true;};
 const loaded=[];w.Image=function(){const image=w.document.createElement('img');Object.defineProperty(image,'src',{set(url){image.setAttribute('src',url);loaded.push(url);Promise.resolve().then(()=>image.onload());}});return image;};
 w.jmpInfo={branding:{homeBackdrop:'wallaby.png'}};w.ApiClient={getCurrentUserId:()=> 'user',getItem:async()=>({Id:'film',BackdropImageTags:['tag']}),getImageUrl:()=> 'film.jpg'};
 for(const name of ['wallaby-artwork.js','wallaby-navigation.js','wallaby-home.js'])w.eval(source(name));
 const tick=()=>new Promise(r=>setTimeout(r,35));
 w.document.querySelector('.card').dispatchEvent(new w.MouseEvent('pointerover',{bubbles:true}));await tick();assert.deepEqual(loaded,[]);assert.ok(tasks.at(-1).delay>900);
 await tasks.at(-1).fn();await tick();assert.deepEqual(loaded,['film.jpg']);assert.equal(w.document.querySelector('.wallaby-home-wallpaper img').getAttribute('src'),'film.jpg');assert.equal(w.document.querySelector('.wallaby-home-header-wallpaper img').getAttribute('src'),'film.jpg');
 w.document.querySelector('.library').dispatchEvent(new w.MouseEvent('pointerover',{bubbles:true}));assert.ok(tasks.at(-1).delay>900); assert.equal(loaded.at(-1),'film.jpg');await tasks.at(-1).fn();await tick();assert.equal(loaded.at(-1),'wallaby.png');
});

test('Home library tiles use Wallaby art while films, episodes and series retain fanart',()=>{
 const {isLibraryItem}=require('../native/wallaby-home.js');
 for(const Type of ['CollectionFolder','UserView','Folder'])assert.equal(isLibraryItem({Type}),true);
 assert.equal(isLibraryItem({CollectionType:'movies'}),true);
 for(const Type of ['Movie','Episode','Series'])assert.equal(isLibraryItem({Type,IsFolder:true}),false);
});

test('modern library navigation hides only the main toolbar and keeps filters and panels fixed',{skip:!dependency},t=>{
 const {JSDOM}=require(dependency);const dom=new JSDOM('<body class="wallaby-media-surface wallaby-library-active"><header class="MuiAppBar-root"><div id="nav" class="MuiToolbar-root padded-left padded-right">Server / Favourites</div><div id="filters" class="MuiToolbar-root padded-left padded-right">Library filters</div></header><div class="wallaby-library-viewport"></div><aside class="wallaby-cinema-detail"></aside></body>');t.after(()=>dom.window.close());const w=dom.window,style=w.document.createElement('style');style.textContent=source('wallaby-popcorn.css');w.document.head.append(style);
 assert.equal(w.getComputedStyle(w.document.getElementById('nav')).display,'none');assert.notEqual(w.getComputedStyle(w.document.getElementById('filters')).display,'none');
 assert.equal(w.getComputedStyle(w.document.querySelector('.wallaby-library-viewport')).position,'fixed');assert.equal(w.getComputedStyle(w.document.querySelector('.wallaby-library-viewport')).overflowY,'auto');assert.equal(w.getComputedStyle(w.document.querySelector('aside')).position,'fixed');
 w.document.body.classList.add('wallaby-home');assert.notEqual(w.getComputedStyle(w.document.getElementById('nav')).display,'none');
});
