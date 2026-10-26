const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const retired=['wallaby-branding.js','wallaby-library-paging.js','wallaby-artwork.js','wallaby-navigation.js','wallaby-home.js','wallaby-library.js','wallaby-popcorn.css'];
test('desktop injects only native player/host plugins and non-visual routing',()=>{
 const source=read('src/system/SystemComponent.cpp');
 const shell=source.slice(source.indexOf('QString SystemComponent::getNativeShellScript()'),source.indexOf('void SystemComponent::fetchPageForCSPWorkaround'));
 const scripts=shell.match(/QStringList scriptPaths = \{([\s\S]*?)\n  \};/)[1].match(/:\/[^"\n]+/g);
 assert.deepEqual(scripts,[':/qtwebchannel/qwebchannel.js',...['mpvVideoPlayer.js','mpvAudioPlayer.js','inputPlugin.js','updatePlugin.js','connectivityHelper.js','nativeshell.js','wallaby-desktop.js'].map(name=>':/web-client/extension/'+name)]);
 assert.ok(!shell.includes('branding'));assert.ok(!shell.includes('wallaby-popcorn.css'));
 for(const name of retired)assert.ok(!scripts.some(script=>script.endsWith('/'+name)));
});
test('historical UI scripts and CSS are excluded from packaged Qt resources',()=>{
 const cmake=read('src/CMakeLists.txt');
 const excluded=cmake.match(/set\(SERVER_UI_OVERRIDES([\s\S]*?)\)/)[1].trim().split(/\s+/);
 assert.deepEqual(excluded,retired);
 assert.ok(cmake.includes('if(NATIVE_RELATIVE IN_LIST SERVER_UI_OVERRIDES)\n    continue()'));
 assert.ok(cmake.includes('${NATIVE_RESOURCE_ARGS}'));
 assert.ok(!cmake.includes('/web-client/extension=${CMAKE_SOURCE_DIR}/native/'));
});
test('remaining Wallaby runtime helper never reads or mutates the graphical interface',()=>{
 const context={window:{},URL,module:{exports:{}}};
 Object.defineProperty(context,'document',{get(){throw Error('Unexpected document access')}});
 vm.runInNewContext(read('native/wallaby-desktop.js'),context);
 assert.deepEqual(Object.keys(context.window.wallabyDesktop),['isManagementUrl']);
 assert.equal(context.window.wallabyDesktop.isManagementUrl('http://[::1]:8096/web/#/home','#/dashboard'),true);
 assert.equal(context.window.wallabyDesktop.isManagementUrl('http://[::1]:8096/web/#/home','https://other.example/#/dashboard'),false);
 assert.ok(!read('native/inputPlugin.js').includes('wallabyNavigation'));
 assert.ok(read('resources/inputmaps/keyboard.json').includes('(Esc|Backspace)'));
});
test('locally supplied connection artwork and app identity remain Wallaby Popcorn',()=>{
 assert.ok(read('native/find-webclient.html').includes('<title>Wallaby Popcorn</title>'));
 assert.ok(read('native/find-webclient.html').includes('src="logo.png"'));
 assert.ok(read('src/ui/webview.qml').includes('title: "Wallaby Popcorn"'));
 for(const file of ['native/logo.png','resources/images/icon.png','resources/images/icon.svg'])assert.ok(fs.statSync(path.join(root,file)).size>0);
});
