const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { continuationQuery, queryFromUrl } = require('../native/wallaby-library-paging.js');

test('continuation retains every native filter while replacing all pagination spellings', () => {
    const q = continuationQuery({parentId:'movies', GenreIds:'comedy', SortBy:'SortName', SortOrder:'Descending', SearchTerm:'wallaby', limit:100, startIndex:100}, 300);
    assert.equal(q.GenreIds, 'comedy'); assert.equal(q.SortOrder, 'Descending'); assert.equal(q.SearchTerm, 'wallaby');
    assert.equal(q.Limit, 100); assert.equal(q.StartIndex, 300); assert.equal(q.limit, undefined); assert.equal(q.startIndex, undefined);
    const captured = queryFromUrl('http://[::1]:8096/Items?parentId=movies&includeItemTypes=Movie&limit=100&genreIds=comedy', 'movies', 'http://[::1]:8096');
    assert.equal(captured.GenreIds, 'comedy');
    assert.equal(queryFromUrl('https://other.example/Items?parentId=movies&includeItemTypes=Movie&limit=100','movies','http://[::1]:8096'), null);
});

// Optional DOM dependency for source-only integration checks, never part of the app build.
const dependency = process.env.WALLABY_JSDOM;
test('modern SDK recovery, 1171 titles, bounded rows/cache, filters, and restoring native paging', {skip:!dependency}, async () => {
    const { JSDOM } = require(dependency);
    const dom = new JSDOM('<main class="page"><span class="MuiChip-label">1-100 of 1,171</span><button title="Next"></button><div class="itemsContainer centered"></div></main>', {url:'http://[::1]:8096/web/#/movies?topParentId=movies',runScripts:'outside-only',pretendToBeVisual:true});
    const w = dom.window, list=w.document.querySelector('.itemsContainer');
    const all=Array.from({length:1171},(_,i)=>({Id:`movie-${i}`,Name:`Movie ${i}`,ProductionYear:1980+i%40}));
    const native={ParentId:'movies',IncludeItemTypes:'Movie',Limit:100,StartIndex:0,GenreIds:'comedy',SortOrder:'Descending'};
    list.innerHTML=all.slice(0,100).map(item=>`<div class="card" data-id="${item.Id}"><div class="cardBox"><span class="cardText">${item.Name}</span></div></div>`).join('');
    const calls=[];
    w.ApiClient={getCurrentUserId:()=> 'test-user',getItems:async(user,q)=>{calls.push({...q});return {Items:all.slice(Number(q.StartIndex||0),Number(q.StartIndex||0)+Number(q.Limit)),TotalRecordCount:1171}}};
    w.wallabyLibraryRoute=()=> 'movies';
    // Simulate a modern SDK request that completed before native script injection.
    w.performance.getEntriesByType=()=>[{name:'http://[::1]:8096/Items?parentId=movies&includeItemTypes=Movie&limit=100&startIndex=0&genreIds=comedy&sortOrder=Descending'}];
    let top=0;
    w.HTMLElement.prototype.getBoundingClientRect=function(){return {top:this.classList.contains('wallaby-virtual-library')?top:0,bottom:60,left:0,right:600,width:600,height:60}};
    w.eval(fs.readFileSync(path.join(__dirname,'../native/wallaby-library-paging.js'),'utf8'));
    const selected=[]; const attach=()=>w.wallabyLibraryPaging.attach(list,row=>selected.push(row.dataset.id),()=>{});
    w.addEventListener('wallaby-library-query',attach); attach();
    const tick=()=>new Promise(resolve=>setTimeout(resolve,35)); await tick();
    assert.ok(list.classList.contains('wallaby-cinema-virtualized'));
    assert.equal(list.querySelector('.wallaby-cinema-name').textContent,'Movie 0');
    assert.equal(list.querySelector('.wallaby-cinema-year').textContent,'1980');
    assert.ok(w.document.querySelector('.MuiChip-label').classList.contains('wallaby-cinema-paging-hidden'));
    assert.ok(list.querySelectorAll('.wallaby-cinema-row').length<100);
    for(let index=100;index<1171;index+=100){top=-index*64;w.dispatchEvent(new w.Event('scroll'));await tick();await tick();}
    top=-1170*64;w.dispatchEvent(new w.Event('scroll'));await tick();await tick();
    assert.ok([...list.querySelectorAll('.wallaby-cinema-name')].some(node=>node.textContent==='Movie 1170'));
    assert.ok(list.querySelectorAll('.wallaby-cinema-row').length<100);
    assert.ok(calls.filter(q=>q.StartIndex>100).every(q=>q.GenreIds==='comedy'&&q.SortOrder==='Descending'&&q.Limit===100));
    list.querySelector('[data-id="movie-1170"]').click();assert.equal(selected.at(-1),'movie-1170');
    const before=calls.length;top=0;w.dispatchEvent(new w.Event('scroll'));await tick();await tick();
    assert.ok(calls.length>before,'evicted first page is loaded again instead of keeping the full library in memory');
    w.wallabyLibraryPaging.reset();assert.ok(!list.classList.contains('wallaby-cinema-virtualized'));
    assert.ok(!w.document.querySelector('.MuiChip-label').classList.contains('wallaby-cinema-paging-hidden'));
    w.close();
});

test('initial native requests are bounded without changing filters or caller settings', () => {
    const { boundedQuery } = require('../native/wallaby-library-paging.js');
    for (const size of [0, 500, 1000]) {
        const query={ParentId:'movies',Limit:size,GenreIds:'comedy',SearchTerm:'wallaby'};
        assert.equal(boundedQuery(query).Limit,100);
        assert.equal(query.Limit,size);
        assert.equal(boundedQuery(query).GenreIds,'comedy');
    }
    assert.equal(boundedQuery({Limit:24}).Limit,24,'small home shelves stay small');
});

test('native layouts retain item actions and hide changing toolbar counts across view switches', {skip:!dependency}, async t => {
    const {JSDOM}=require(dependency);
    const dom=new JSDOM('<header><div class="MuiToolbar-root padded-left padded-right"><div class="MuiChip-root"><span class="MuiChip-label">1-100 of 1,171</span></div><button title="Next"></button><button id="filters">Filters</button></div></header><main class="page"><div class="itemsContainer centered"></div></main>',{url:'http://[::1]:8096/web/#/movies?topParentId=movies',runScripts:'outside-only',pretendToBeVisual:true});
    t.after(()=>dom.window.close());
    const w=dom.window,list=w.document.querySelector('.itemsContainer');
    const all=Array.from({length:1171},(_,i)=>({Id:`movie-${i}`,Type:'Movie',Name:`Movie ${i}`,ProductionYear:2000+i%20,ImageTags:{Primary:`art-${i}`},UserData:{Played:i%2===0}}));
    list.innerHTML=all.slice(0,100).map(item=>`<div class="card portraitCard" data-id="${item.Id}" data-type="Movie"><a class="cardImageContainer itemAction" data-id="${item.Id}" href="#/details?id=${item.Id}" style="background-image:url('/Items/${item.Id}/Images/Primary')"></a><div class="cardText"><a>${item.Name}</a></div><div class="cardText">${item.ProductionYear}</div><button class="itemAction" data-action="play" data-id="${item.Id}">Play</button></div>`).join('');
    let top=0;
    w.HTMLElement.prototype.getBoundingClientRect=function(){return {top:this.classList.contains('wallaby-virtual-library')?top:0,bottom:300,width:this.classList.contains('card')?180:900,height:this.classList.contains('card')?300:64}};
    const calls=[];
    w.wallabyLibraryRoute=()=> 'movies';
    w.ApiClient={getCurrentUserId:()=> 'user',serverId:()=> 'server',getImageUrl:(id)=>`/Items/${id}/Images/Primary`,getItems:async(user,q)=>{calls.push({...q});return {Items:all.slice(Number(q.StartIndex||0),Number(q.StartIndex||0)+Number(q.Limit)),TotalRecordCount:1171}}};
    w.eval(fs.readFileSync(path.join(__dirname,'../native/wallaby-library-paging.js'),'utf8'));
    await w.ApiClient.getItems('user',{ParentId:'movies',IncludeItemTypes:'Movie',Limit:1000,SortOrder:'Descending'});
    assert.equal(calls[0].Limit,100);
    w.performance.getEntriesByType=()=>[];
    let mode='native';
    const attach=()=>w.wallabyLibraryPaging.attach(list,()=>{},()=>{},{mode});
    w.addEventListener('wallaby-library-query',attach);attach();
    const tick=()=>new Promise(resolve=>setTimeout(resolve,40));await tick();
    assert.ok(w.document.querySelector('.MuiChip-root').classList.contains('wallaby-cinema-paging-hidden'));
    assert.ok(!w.document.getElementById('filters').classList.contains('wallaby-cinema-paging-hidden'));
    assert.ok(list.querySelectorAll('.wallaby-virtual-card').length<100);
    assert.equal(list.querySelectorAll('.card[data-id="movie-0"]').length,1,'hidden originals cannot duplicate actionable IDs');
    top=-88000;w.dispatchEvent(new w.Event('scroll'));await tick();await tick();
    const card=list.querySelector('.wallaby-virtual-card');
    assert.ok(card && Number(card.dataset.id.split('-')[1])>100);
    assert.equal(card.querySelector('button').dataset.id,card.dataset.id);
    assert.ok(card.querySelector('a').getAttribute('href').includes(card.dataset.id));
    assert.ok(card.querySelector('.cardImageContainer').style.backgroundImage.includes(card.dataset.id));
    assert.equal(card.querySelector('.cardText').textContent,`Movie ${card.dataset.id.split('-')[1]}`);
    for(let i=0;i<4;i++) {mode=i%2?'native':'cinema';w.document.querySelector('.MuiChip-label').textContent=i%2?'50':'1-100 of 1,171';attach();await tick();}
    assert.ok(w.document.querySelector('.MuiChip-root').classList.contains('wallaby-cinema-paging-hidden'));
    assert.equal(list.querySelectorAll('.wallaby-virtual-library').length,1);
    assert.ok(calls.every(q=>q.Limit===100 && q.SortOrder==='Descending'));
    w.wallabyLibraryPaging.reset();assert.equal(list.querySelectorAll('.card[data-id]').length,100);
    assert.equal(list.querySelectorAll('[data-wallaby-original-id]').length,0);
    w.close();
});

test('repeated 50-item SDK refreshes and native innerHTML repaints keep loaded rows and scroll cache',{skip:!dependency},async t=>{
 const {JSDOM}=require(dependency);const dom=new JSDOM('<main><div class="itemsContainer"></div></main>',{url:'http://[::1]:8096/web/#/movies?topParentId=movies',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window,list=w.document.querySelector('.itemsContainer');
 const all=Array.from({length:1171},(_,i)=>({Id:`m${i}`,Name:`Movie ${i}`})),query={ParentId:'movies',IncludeItemTypes:'Movie',Limit:50,SortOrder:'Ascending'};const calls=[];
 const native=()=>all.slice(0,50).map(item=>`<div class="card" data-id="${item.Id}"><span class="cardText">${item.Name}</span></div>`).join('');list.innerHTML=native();
 w.ApiClient={getCurrentUserId:()=> 'user',getItems:async(user,q)=>{calls.push({...q});return {Items:all.slice(Number(q.StartIndex||0),Number(q.StartIndex||0)+Number(q.Limit)),TotalRecordCount:1171}}};w.wallabyLibraryRoute=()=> 'movies';w.performance.getEntriesByType=()=>[];
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {top:this.classList.contains('wallaby-virtual-library')?-list.scrollTop:0,width:600,height:64,bottom:64,left:0,right:600}};
 w.eval(fs.readFileSync(path.join(__dirname,'../native/wallaby-library-paging.js'),'utf8'));await w.ApiClient.getItems('user',query);
 const attach=()=>w.wallabyLibraryPaging.attach(list,()=>{},()=>{});w.addEventListener('wallaby-library-query',attach);attach();const tick=()=>new Promise(r=>setTimeout(r,35));await tick();await tick();
 list.scrollTop=640*64;w.dispatchEvent(new w.Event('scroll'));await tick();await tick();
 assert.ok(list.textContent.includes('Movie 640'));const host=list.querySelector('.wallaby-virtual-library'),before=calls.filter(q=>q.Limit===100).length;
 for(let i=0;i<4;i++){await w.ApiClient.getItems('user',{...query});await tick();assert.equal(list.querySelector('.wallaby-virtual-library'),host);assert.ok(!host.textContent.includes('Loading titles'));}
 assert.equal(calls.filter(q=>q.Limit===100).length,before,'refresh must not refetch a cached viewport');
 list.innerHTML=native();list.scrollTop=0;attach();await tick();assert.equal(list.scrollTop,640*64);assert.ok(list.textContent.includes('Movie 640'));assert.ok(!list.querySelector('.wallaby-virtual-library').textContent.includes('Loading titles'));
});
