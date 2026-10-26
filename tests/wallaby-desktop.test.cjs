const { test } = require('node:test');
const assert = require('node:assert/strict');
const {isManagementUrl}=require('../native/wallaby-desktop.js');
test('dashboard navigation stays in app only for the same server origin',()=>{
 const current='http://127.0.0.1:24123/web/#/home';
 assert.equal(isManagementUrl(current,'#/dashboard'),true);
 assert.equal(isManagementUrl(current,'#!/metadata?item=1'),true);
 for(const url of ['http://127.0.0.1:24124/web/#/dashboard','https://127.0.0.1:24123/web/#/dashboard','http://other.example/web/#/dashboard','javascript:alert(1)','http://user@127.0.0.1:24123/web/#/dashboard']) assert.equal(isManagementUrl(current,url),false);
});
