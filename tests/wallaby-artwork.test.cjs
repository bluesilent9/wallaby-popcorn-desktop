// Historical server-UI experiment; not shipped by the restored desktop.
const {test:historicalTest}=require('node:test'); const assert=require('node:assert/strict');
const test = name => historicalTest(name, {skip:'Client UI overrides retired in revision8'}, () => {});
const {createArtworkScheduler}=require('../native/wallaby-artwork.js');
test('artwork waits one second, holds the old image while loading, and ignores superseded images',async()=>{
 let tasks=[],shown=['old'],requests=[],pending={};
 const scheduler=createArtworkScheduler({load:url=>{requests.push(url);return new Promise((resolve,reject)=>pending[url]={resolve,reject});},show:image=>shown.push(image),later:(fn,delay)=>{const task={fn,delay};tasks.push(task);return task;},cancel:task=>{task.cancelled=true;}});
 scheduler.select('a');assert.equal(tasks[0].delay,1000);assert.deepEqual(requests,[]);assert.deepEqual(shown,['old']);
 scheduler.select('b');assert.equal(tasks[0].cancelled,true);const b=tasks[1].fn();assert.deepEqual(shown,['old']);
 scheduler.select('c');const c=tasks[2].fn();pending.b.resolve('b');await b;assert.deepEqual(shown,['old']);
 pending.c.resolve('c');await c;assert.deepEqual(shown,['old','c']);
 scheduler.select('bad');const bad=tasks[3].fn();pending.bad.reject(new Error('failed image'));await bad;assert.deepEqual(shown,['old','c']);
 scheduler.select('leave');scheduler.cancel();assert.equal(tasks[4].cancelled,true);
});
