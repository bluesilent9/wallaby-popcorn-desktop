// Historical server-UI experiment; not shipped by the restored desktop.
const {test:historicalTest}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const test = name => historicalTest(name, {skip:'Client UI overrides retired in revision8'}, () => {});
const dependency=process.env.WALLABY_JSDOM;
test('controller survives repeated view changes without repaint loops or stale opaque rows',{skip:!dependency},async t=>{
 const {JSDOM}=require(dependency);
 const dom=new JSDOM('<header class="skinHeader"></header><main class="page"><div class="itemsContainer centered"></div></main>',{url:'http://[::1]:8096/web/#/movies?topParentId=movies',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window,list=w.document.querySelector('.itemsContainer');
 w.HTMLElement.prototype.getClientRects=function(){return [this.getBoundingClientRect()]};
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {top:150,bottom:250,right:1000,left:0,width:this.classList.contains('card')?180:1000,height:100}};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.performance.getEntriesByType=()=>[];
 let frames=0;const raf=w.requestAnimationFrame.bind(w);w.requestAnimationFrame=fn=>{frames++;return raf(fn)};
 const all=Array.from({length:171},(_,i)=>({Id:`m${i}`,Name:`Movie ${i}`,ProductionYear:2000,Type:'Movie'}));
 w.ApiClient={getCurrentUserId:()=> 'user',serverAddress:()=>w.location.origin,serverId:()=> 'server',getItems:async(user,q)=>({Items:all.slice(q.StartIndex||0,(q.StartIndex||0)+Number(q.Limit)),TotalRecordCount:171}),getItem:async(user,id)=>all.find(i=>i.Id===id)};
 const script=name=>w.eval(fs.readFileSync(path.join(__dirname,'../native',name),'utf8'));
 script('wallaby-library-paging.js');script('wallaby-artwork.js');script('wallaby-library.js');
 const result=await w.ApiClient.getItems('user',{ParentId:'movies',IncludeItemTypes:'Movie',Limit:100});
 list.innerHTML=result.Items.map(item=>`<div class="card" data-id="${item.Id}"><a href="#/details?id=${item.Id}"><div class="cardText">${item.Name}</div><div class="cardText">2000</div></a></div>`).join('');
 const tick=()=>new Promise(r=>setTimeout(r,100));await tick();
 let nativeClicks=0,gearClicks=0;
 const openMenu=async()=>{
  w.document.getElementById('selectview-popover')?.remove();
  // MUI Popover hides its sibling app tree from assistive technology, not visually.
  w.document.querySelector('main').setAttribute('aria-hidden','true');
  const popup=w.document.createElement('div');popup.id='selectview-popover';
  popup.innerHTML='<ul role="menu"><li role="menuitem" tabindex="-1" class="MuiMenuItem-root" id="grid"><span class="MuiListItemIcon-root">✓</span>Grid View<button id="gear">Settings</button></li><div><ul role="menu"><li role="menuitem" id="nested">Image type</li></ul></div><li role="menuitem" tabindex="-1" class="MuiMenuItem-root" id="native-list"><span class="MuiListItemIcon-root"></span>List View</li></ul>';
  popup.querySelector('#gear').onclick=e=>{e.stopPropagation();gearClicks++};
  for(const id of ['grid','native-list'])popup.querySelector('#'+id).onclick=()=>{nativeClicks++;w.localStorage.setItem('native-view',id)};
  w.document.body.append(popup);await tick();
  return popup.querySelector('.wallaby-standard-view');
 };
 await openMenu();
 for(let i=0;i<6;i++){
  const button=await openMenu();assert.equal(button.textContent,'Standard View');button.click();await tick();
  assert.equal(w.document.querySelectorAll('.wallaby-standard-view').length,1);
  assert.equal(w.document.querySelectorAll('.wallaby-native-view-overridden').length,2);
  w.document.getElementById('gear').click();await tick();assert.ok(list.classList.contains('wallaby-cinema-items'));
  w.document.getElementById(i%2?'grid':'native-list').click();await tick();
  assert.equal(list.classList.contains('wallaby-cinema-items'),false);
  assert.equal(w.document.querySelectorAll('.wallaby-native-view-overridden').length,0);
  assert.equal(list.querySelectorAll('.wallaby-virtual-library').length,1);
 }
 assert.equal(nativeClicks,6);assert.equal(gearClicks,6);
 assert.equal(w.document.querySelector('.wallaby-cinema-toggle'),null);
 const before=frames;await tick();await tick();assert.ok(frames-before<5,`view should settle, not loop (${frames-before} extra frames)`);
 assert.ok(list.querySelectorAll('.wallaby-virtual-card').length<100);
 const choice=w.document.querySelector('.wallaby-standard-view');
 choice.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await tick();
 assert.equal(list.querySelector('.wallaby-cinema-name').textContent,'Movie 0');
 assert.equal(list.querySelector('.wallaby-cinema-year').textContent,'2000');
 assert.equal(w.document.querySelectorAll('.wallaby-cinema-detail').length,1);
 // Dismiss/reopen the native popup without duplicating or losing the active choice.
 const reopened=await openMenu();assert.ok(reopened.classList.contains('Mui-selected'));
 w.document.getElementById('selectview-popover').remove();
 w.document.querySelector('main').removeAttribute('aria-hidden');await tick();
 // Logout, another library, then return: preference remains scoped to this user/library.
 let user='user';w.ApiClient.getCurrentUserId=()=>user;
 user=null;w.dispatchEvent(new w.Event('focus'));await tick();
 assert.equal(w.document.querySelector('.wallaby-standard-view'),null);
 user='other';w.dispatchEvent(new w.Event('focus'));await tick();
 assert.equal(list.classList.contains('wallaby-cinema-items'),false);
 user='user';w.dispatchEvent(new w.Event('focus'));await tick();
 assert.equal(list.classList.contains('wallaby-cinema-items'),true);
 w.location.hash='#/movies?topParentId=another-library';await tick();
 assert.equal(list.classList.contains('wallaby-cinema-items'),false);
 w.location.hash='#/movies?topParentId=movies';await tick();
 assert.equal(list.classList.contains('wallaby-cinema-items'),true);
 assert.equal(w.localStorage.getItem(`wallaby.cinema.${w.location.origin}.user.movies`),'cinema');
 assert.equal(w.localStorage.getItem('native-view'),'grid');
});
