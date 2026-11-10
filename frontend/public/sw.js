/* Only a public offline screen is cached. Chats, credentials, APIs and media never enter this cache. */
const CACHE='llm-chat-offline-v1';
const OFFLINE='/offline.html';
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.add(new Request(OFFLINE,{cache:'reload'}))));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('llm-chat-offline-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{
 if(event.data?.type==='ACTIVATE_UPDATE'){self.skipWaiting();return}
 if(event.data?.type==='SHOW_NOTIFICATION'&&self.registration?.showNotification){
  const {title='LLM Chat',body='',tag='llm-chat',data={}}=event.data;
  const task=self.registration.showNotification(title,{body,tag,icon:'/icon-192.png',badge:'/icon-192.png',data});
  if(typeof event.waitUntil==='function')event.waitUntil(task);
 }
});
self.addEventListener('push',event=>{
 if(!self.registration?.showNotification)return;
 let payload={title:'LLM Chat',body:'Операция завершена',tag:'llm-chat',data:{}};
 try{if(event.data)payload={...payload,...event.data.json()}}catch{}
 const task=self.registration.showNotification(payload.title,{body:payload.body,tag:payload.tag,icon:'/icon-192.png',badge:'/icon-192.png',data:payload.data});
 if(typeof event.waitUntil==='function')event.waitUntil(task);
});
self.addEventListener('notificationclick',event=>{
 event.notification?.close?.();
 const data=event.notification?.data||{};
 if(!self.clients?.matchAll)return;
 const task=self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
  const client=clients?.[0];
  if(client){
   client.postMessage?.({type:'NOTIFICATION_CLICK',data});
   return client.focus?.();
  }
  return self.clients.openWindow?.('/');
 });
 if(typeof event.waitUntil==='function')event.waitUntil(task);
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||request.mode!=='navigate'||url.origin!==self.location.origin||!['/','/index.html','/preview'].includes(url.pathname))return;
 event.respondWith(fetch(request).then(async response=>response.status>=500?(await caches.match(OFFLINE))||response:response).catch(async()=>{
  return (await caches.match(OFFLINE))||new Response('LLM Chat: сервер недоступен. Повторите подключение.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
 }));
});
