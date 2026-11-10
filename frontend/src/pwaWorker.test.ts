import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(){
 const events=new Map<string,(event:any)=>void>(),saved:string[]=[],notifications:Array<{title:string;options:any}>=[],offline=new Response('Offline screen');
 let fail=false,status=200,activated=false,focused=false;
 const self={
  location:{origin:'https://chat.example'},
  registration:{showNotification:async(title:string,options:any)=>{notifications.push({title,options})}},
  clients:{
   claim:async()=>{},
   matchAll:async()=>[{postMessage:()=>{},focus:async()=>{focused=true}}],
   openWindow:async()=>{},
  },
  skipWaiting:()=>{activated=true},
  addEventListener:(name:string,handler:(event:any)=>void)=>events.set(name,handler),
 };
 runInNewContext(source,{self,URL,Request,Response,caches:{open:async()=>({add:async(request:Request)=>{saved.push(request.url)}}),keys:async()=>[],match:async()=>offline},fetch:async()=>{if(fail)throw Error('offline');return new Response('Network',{status})}});
 const navigate=async(path='/',mode='navigate',method='GET')=>{let response:Promise<Response>|undefined;events.get('fetch')!({request:{url:'https://chat.example'+path,mode,method},respondWith:(value:Promise<Response>)=>{response=value}});return response};
 return {events,saved,notifications,navigate,fail:()=>{fail=true},unavailable:()=>{status=503},activated:()=>activated,focused:()=>focused};
}
it('keeps successful launches on the network and never caches account pages',async()=>{
 const w=worker();expect(await (await w.navigate())!.text()).toBe('Network');expect(w.saved).toEqual([]);
});
it('uses a public offline screen for failed and unavailable launches',async()=>{
 const w=worker();w.fail();expect(await (await w.navigate())!.text()).toBe('Offline screen');
 const other=worker();other.unavailable();expect(await (await other.navigate())!.text()).toBe('Offline screen');
});
it('leaves API, generation, media and non-launch navigations entirely untouched',async()=>{
 const w=worker();for(const path of ['/api/chats','/api/chat/generate','/api/images/file','/ui-assets/main.js','/unknown'])expect(await w.navigate(path)).toBeUndefined();
 expect(await w.navigate('/','cors')).toBeUndefined();expect(await w.navigate('/','navigate','POST')).toBeUndefined();
});
it('does not force an update into an open conversation',()=>{
 const w=worker();expect(w.activated()).toBe(false);w.events.get('message')!({data:{type:'unrelated'}});expect(w.activated()).toBe(false);
 w.events.get('message')!({data:{type:'ACTIVATE_UPDATE'}});expect(w.activated()).toBe(true);
});
it('shows background completion notifications and focuses client on click',async()=>{
 const w=worker();
 w.events.get('message')!({data:{type:'SHOW_NOTIFICATION',title:'LLM Chat',body:'Ответ модели готов',tag:'chat-1'}});
 expect(w.notifications).toHaveLength(1);
 expect(w.notifications[0].title).toBe('LLM Chat');
 expect(w.notifications[0].options.body).toBe('Ответ модели готов');
 let clickTask:Promise<unknown>|undefined;
 w.events.get('notificationclick')!({notification:{close:()=>{},data:{chatId:'1'}},waitUntil:(p:Promise<unknown>)=>{clickTask=p}});
 await clickTask;
 expect(w.focused()).toBe(true);
});
