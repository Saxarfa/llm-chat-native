import {afterEach,describe,it,expect,vi} from 'vitest';
import {mirrorNativeStorage,flushNativeStorage} from './storage';

class MemoryStorage{
 getItem(key:string){return Object.hasOwn(this,key)?String((this as unknown as Record<string,string>)[key]):null}
 setItem(key:string,value:string){Object.defineProperty(this,key,{value:String(value),writable:true,enumerable:true,configurable:true})}
 removeItem(key:string){delete (this as unknown as Record<string,string>)[key]}
 clear(){for(const key of Object.keys(this))this.removeItem(key)}
}
let restore:(()=>void)|undefined;
afterEach(()=>{restore?.();restore=undefined;vi.unstubAllGlobals()});
function setup(){
 const local=new MemoryStorage(),session=new MemoryStorage(),native=new Map<string,string>();
 vi.stubGlobal('Storage',MemoryStorage);vi.stubGlobal('localStorage',local);vi.stubGlobal('sessionStorage',session);vi.stubGlobal('window',new EventTarget());
 const prefs={get:async({key}:{key:string})=>({value:native.get(key)??null}),set:async({key,value}:{key:string;value:string})=>{native.set(key,value)},remove:async({key}:{key:string})=>{native.delete(key)},keys:async()=>({keys:[...native.keys()]})};
 return {local,session,native,prefs};
}
describe('native durable state',()=>{
 it('restores session drafts and auth before the application reads them',async()=>{
  const {local,session,prefs}=setup();
  local.setItem('llamachat_auth_token','fixture');session.setItem('llm-account-1:llm-draft-a','draft');
  restore=await mirrorNativeStorage('http://fixture',prefs);restore();
  local.clear();session.clear();
  restore=await mirrorNativeStorage('http://fixture',prefs);
  expect(local.getItem('llamachat_auth_token')).toBe('fixture');expect(session.getItem('llm-account-1:llm-draft-a')).toBe('draft');
 });
 it('serializes rapid updates then logout without resurrecting deleted auth',async()=>{
  const {local,prefs,native}=setup();restore=await mirrorNativeStorage('http://fixture',prefs);
  local.setItem('llamachat_auth_token','old');local.setItem('llamachat_auth_token','new');local.removeItem('llamachat_auth_token');await flushNativeStorage();restore();
  local.setItem('llamachat_auth_token','stale-web-cache');restore=await mirrorNativeStorage('http://fixture',prefs);
  expect(local.getItem('llamachat_auth_token')).toBeNull();expect([...native.values()]).not.toContain('old');
 });
 it('does not copy conversation databases or unrelated origins into Preferences',async()=>{
  const {local,prefs,native}=setup();local.setItem('llm-account-1:llamachat_conversations','large-cache');local.setItem('unrelated','private');
  restore=await mirrorNativeStorage('http://fixture',prefs);await flushNativeStorage();
  expect([...native.values()]).not.toContain('large-cache');expect([...native.values()]).not.toContain('private');
 });
});
