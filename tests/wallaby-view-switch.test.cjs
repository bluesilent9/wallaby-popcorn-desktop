const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
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
 for(let i=0;i<6;i++){const button=w.document.querySelector('.wallaby-cinema-toggle');assert.ok(button);button.click();await tick();assert.equal(list.querySelectorAll('.wallaby-virtual-library').length,1);}
 const before=frames;await tick();await tick();assert.ok(frames-before<5,`view should settle, not loop (${frames-before} extra frames)`);
 assert.ok(list.querySelectorAll('.wallaby-virtual-card').length<100);
 w.document.querySelector('.wallaby-cinema-toggle').click();await tick();
 assert.equal(list.querySelector('.wallaby-cinema-name').textContent,'Movie 0');
 assert.equal(list.querySelector('.wallaby-cinema-year').textContent,'2000');
 assert.equal(w.document.querySelectorAll('.wallaby-cinema-detail').length,1);
});
