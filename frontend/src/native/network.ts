import {Preferences} from '@capacitor/preferences';
import {isNativeIOS} from './platform';
import {flushNativeStorage,isAppKey} from './storage';
const SERVER_KEY='llmchat-server-v1';
let server='';
export function normalizeServer(value:string){
 const url=new URL(value.trim());
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Укажите адрес сервера без пароля, пути и параметров.');
 return url.origin;
}
export const nativeServer=()=>server;
export function serverRequestURL(input:string,base=server){
 const url=new URL(input,location.href);
 return url.protocol===location.protocol&&url.host===location.host&&/^\/(api|v1|props|health)(\/|$)/.test(url.pathname)
  ?base+url.pathname+url.search:input;
}
export async function initializeNativeNetwork(){
 const saved=(await Preferences.get({key:SERVER_KEY})).value;
 server=saved||import.meta.env.VITE_IOS_SERVER_URL||'';
 if(server)server=normalizeServer(server);
 (window as Window&{__LLM_SERVER_ORIGIN__?:string}).__LLM_SERVER_ORIGIN__=server;
 const original=window.fetch.bind(window);
 window.fetch=async(input,init)=>{
  const raw=input instanceof Request?input.url:String(input),target=serverRequestURL(raw);
  if(target===raw)return original(input,init);
  if(!server)throw Error('Сначала подключите сервер LLM Chat.');
  // Keep the original browser Response/ReadableStream, AbortSignal and binary
  // body; no JSON transport and no buffering of token streams.
  const request=input instanceof Request?new Request(target,input):target;
  const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));
  const token=localStorage.getItem('llamachat_auth_token');
  if(token&&!headers.has('Authorization'))headers.set('Authorization','Bearer '+token);
  return original(request,{...init,headers,credentials:'omit'});
 };
}
export async function saveNativeServer(value:string){
 const next=normalizeServer(value);
 // This request deliberately has no credentials from the previous server.
 const response=await fetch(next+'/api/auth/me',{signal:AbortSignal.timeout(8000),credentials:'omit'});
 // The existing health endpoint probes models and requires a signed-in user.
 // An unauthenticated 401 from auth/me confirms the API is reachable without
 // starting a model or sending credentials to the new server.
 if(!(response.ok||response.status===401)||!response.headers.get('content-type')?.includes('application/json'))throw Error('Сервер не ответил. Проверьте адрес и запустите LLM Chat на ПК.');
 await flushNativeStorage();
 await Preferences.set({key:SERVER_KEY,value:next});
 // Each server has its own native storage namespace. Clear only the WebKit
 // cache before restart, without deleting the previous native namespace.
 sessionStorage.setItem('native-server-changing','1');
 location.reload();
}
export async function clearWebCacheForServerChange(){
 if(sessionStorage.getItem('native-server-changing')!=='1')return;
 for(const area of [localStorage,sessionStorage])for(const key of Object.keys(area))if(isAppKey(key))area.removeItem(key);
 sessionStorage.removeItem('native-server-changing');
}
export function openServerSettings(){if(isNativeIOS())window.dispatchEvent(new Event('native-server-settings'))}
