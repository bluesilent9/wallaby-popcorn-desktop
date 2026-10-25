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
