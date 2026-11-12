// Real browser engines, simulated Capacitor plugins and API. No personal API.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ILYAS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'frontend/dist-ios'),out=path.join(root,'.runtime/capacitor-ios/browser');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://fixture').pathname;
 const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
const user={id:909,username:'fixture',display_name:'Проверка'},model='fixture-model';
const chat={id:'native-fixture',title:'Проверка iPhone',model_id:model,active_branch_id:'main',overrides:{},messages:[{id:'q',role:'user',content:'Проверка интерфейса',timestamp:1},{id:'a',role:'assistant',content:'Готовый ответ для проверки приложения.',timestamp:2}],createdAt:1,updatedAt:2};
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;const results=[];
 try{for(const [name,engine,width,theme,setup] of [['setup-375',webkit,375,'dark',true],['setup-1280',chromium,1280,'light',true],['native-402',webkit,402,'dark',false],['native-320',webkit,320,'light',false]]){
  const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'chrome'}:{})});
  try{
   const context=await browser.newContext({viewport:{width,height:874},hasTouch:true,isMobile:width<801,serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'});
   const values=new Map(),calls=[],errors=[],api=[];const backend='http://native-fixture.invalid:8000';
   if(!setup)values.set('llmchat-server-v1',backend);
   await context.exposeFunction('nativeTestCall',async(plugin,method,args)=>{
    calls.push({plugin,method,args});
    if(plugin==='Preferences'){
     if(method==='get')return {value:values.get(args.key)||null};if(method==='keys')return {keys:[...values.keys()]};
     if(method==='set')values.set(args.key,args.value);if(method==='remove')values.delete(args.key);return {};
    }
    if(method==='checkPermissions'||method==='requestPermissions')return {display:'granted'};
    if(plugin==='Filesystem'&&method==='writeFile')return {uri:'file:///fixture/'+args.path};
    return {};
   });
   await context.addInitScript(({theme,setup})=>{
    if(window!==top)return;
    const clear=Storage.prototype.clear;window.clearOnlyWebKit=()=>{clear.call(localStorage);clear.call(sessionStorage)};
    if(!setup&&!sessionStorage.getItem('fixture-initialized')){
     localStorage.setItem('llamachat_auth_token','synthetic-token');localStorage.setItem('llamachat_auth_user',JSON.stringify({id:909}));
     localStorage.setItem('llm-account-909:saxara_chat_theme',theme);sessionStorage.setItem('llm-active-chat-909','native-fixture');sessionStorage.setItem('fixture-initialized','1');
    }
    window.CapacitorCustomPlatform={name:'ios'};
    const methods={Preferences:['get','set','remove','keys'],Keyboard:['setAccessoryBarVisible','setStyle','addListener','removeListener'],App:['addListener','removeListener'],LocalNotifications:['checkPermissions','requestPermissions','schedule','addListener','removeListener'],Haptics:['impact','notification','selectionChanged'],StatusBar:['setStyle'],SplashScreen:['hide'],Filesystem:['writeFile','readFile','deleteFile'],Share:['share']};
    window.nativeListeners={};
    window.Capacitor={PluginHeaders:Object.entries(methods).map(([name,methods])=>({name,methods:methods.map(name=>({name,rtype:name==='addListener'?'callback':'promise'}))})),nativePromise:(plugin,method,args)=>window.nativeTestCall(plugin,method,args),nativeCallback:(plugin,method,args,callback)=>{window.nativeListeners[plugin+':'+args.eventName]=callback;return 'fixture-callback'}};
    const original=fetch;window.fetch=(input,options)=>{
     const url=new URL(typeof input==='string'?input:input.url,location.href);
     if(url.pathname==='/api/sync/events')return Promise.resolve(new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"type":"connected"}\n\n'));options?.signal?.addEventListener('abort',()=>c.error(new DOMException('Aborted','AbortError')))}}),{headers:{'Content-Type':'text/event-stream'}}));
     return original(input,options);
    };
   },{theme,setup});
   await context.route('**/api/**',async route=>{
    const request=route.request(),p=new URL(request.url()).pathname;api.push({path:p,authorization:request.headers().authorization});
    let data={ok:true,items:[],models:[],folders:[],presets:[],jobs:[],notes:[],pins:[],collections:[],chats:[]};
    if(p==='/api/auth/me')data=setup?{detail:'Требуется вход'}:{ok:true,user,token:'synthetic-token'};
    else if(p==='/api/chats')data={ok:true,chats:[chat]};else if(p==='/api/chats/native-fixture')data={ok:true,chat};
    else if(p.includes('/status/'))data={is_generating:false,chat};
    else if(p==='/api/settings')data={ok:true,settings:{model,autoTitle:false,chatSuggestions:false},model_profiles:{[model]:{}}};
    else if(p.includes('probe'))data={ok:true,n_ctx:8192,raw:{data:[]}};
    await route.fulfill({status:setup&&p==='/api/auth/me'?401:200,contentType:'application/json',body:JSON.stringify(data),headers:{'Access-Control-Allow-Origin':'*'}});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
   await page.goto(base);
   if(setup){
    await page.locator('#native-server').waitFor();assert.equal(api.length,0);await page.screenshot({path:path.join(out,name+'.png')});
    await page.locator('#native-server').fill(backend);await page.getByRole('button',{name:'Подключить',exact:true}).click();
    await page.locator('#auth-username').waitFor();assert.equal(values.get('llmchat-server-v1'),backend);
    assert(api.every(call=>!call.authorization),'Connection probe must not reuse credentials');
   }
   else{
    const input=page.frameLocator('.chat-composer-editor-frame').locator('textarea');await input.waitFor();
    assert(api.some(call=>call.path==='/api/auth/me'&&call.authorization==='Bearer synthetic-token'));
    await input.fill('Сохранённый черновик iPhone');await page.waitForTimeout(650);
    await page.evaluate(()=>window.nativeListeners['Keyboard:keyboardWillShow']({keyboardHeight:300}));await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--keyboard-inset')),'300px');
    await page.screenshot({path:path.join(out,name+'-keyboard.png')});
    await page.evaluate(()=>window.nativeListeners['Keyboard:keyboardWillHide']());await page.waitForTimeout(500);
    await page.evaluate(()=>{window.clearOnlyWebKit();sessionStorage.setItem('fixture-initialized','1')});await page.reload();await input.waitFor();
    assert.equal(await input.inputValue(),'Сохранённый черновик iPhone');
    await page.evaluate(()=>{const link=document.createElement('a');link.href='data:text/plain;charset=utf-8,fixture';link.download='example.txt';link.click()});
    await page.waitForFunction(()=>true);for(let i=0;i<30&&!calls.some(c=>c.plugin==='Share');i++)await page.waitForTimeout(100);
    assert(calls.some(c=>c.plugin==='Share'&&c.method==='share'&&c.args.files?.length===1));
    await page.screenshot({path:path.join(out,name+'.png')});
    await page.setViewportSize({width:874,height:402});await page.waitForTimeout(400);
    assert.equal(await input.inputValue(),'Сохранённый черновик iPhone');
    await page.screenshot({path:path.join(out,name+'-landscape.png')});
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   assert.deepEqual(errors,[]);results.push({name,passed:true,apiRequests:api.length,nativeCalls:calls.length});console.log(name+' passed');
   await context.close();
  }finally{await browser.close()}
 }}finally{server.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2))}
})().catch(error=>{console.error(error);process.exit(1)});
