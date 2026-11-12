import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Chat,State} from './types';

const hooks=vi.hoisted(()=>({subscribe:undefined as undefined|((listener:()=>void)=>()=>void)}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useSyncExternalStore:(subscribe:(listener:()=>void)=>()=>void,snapshot:()=>unknown)=>{hooks.subscribe=subscribe;return snapshot()}}));
const conversation=(id:string,branch='main'):Chat=>({id,title:id,model_id:`model-${id}`,active_branch_id:branch,overrides:{},createdAt:1,updatedAt:1,messages:[{id:`${id}-q`,role:'user',content:'Synthetic question',timestamp:1},{id:`${id}-${branch}-answer`,role:'assistant',content:'Synthetic answer',timestamp:2}]});
function deferred(){let resolve!:(response:Response)=>void;const promise=new Promise<Response>(done=>{resolve=done});return {promise,resolve}}
beforeEach(()=>{
 vi.resetModules();hooks.subscribe=undefined;
 vi.stubGlobal('location',{origin:'http://localhost:8000'});
 vi.stubGlobal('document',{hidden:false,addEventListener:vi.fn()});
 vi.stubGlobal('sessionStorage',{getItem:()=>null,setItem:vi.fn(),removeItem:vi.fn()});
 vi.stubGlobal('window',{dispatchEvent:vi.fn(),storageManager:{getSettings:()=>({model:'m'}),getAuthHeaders:()=>({'Content-Type':'application/json'}),setActiveChatId:vi.fn(),applyRemoteChat:vi.fn(),accountKey:(key:string)=>key+'-1'}});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()});
async function fixture(fetcher:(path:string,options?:RequestInit)=>Response|Promise<Response>){
 vi.stubGlobal('fetch',vi.fn(async(path:string,options?:RequestInit)=>fetcher(path,options)));const store=await import('./store');
 Object.assign(store.getState(),{user:{id:1},ready:true,active:'a',chats:[conversation('a')]});
 const snapshots:{active:string;branch?:string;model?:string;live?:string;queued:number;navigation?:State['navigation'];search?:State['searchTarget']}[]=[];
 store.useChat();const unsubscribe=hooks.subscribe!(()=>{const state=store.getState(),current=state.chats.find(item=>item.id===state.active);snapshots.push({active:state.active,branch:current?.active_branch_id,model:current?.model_id,live:state.lives[state.active]?.text,queued:state.queues.length,navigation:state.navigation,search:state.searchTarget})});
 return {store,snapshots,unsubscribe};
}

it('admits cached history synchronously and never waits for a background status refresh',async()=>{
 const hold=deferred(),f=await fixture(()=>hold.promise);
 f.store.getState().chats.push(conversation('b'));
 const selected=f.store.selectChat('b');
 expect(f.store.getState().active).toBe('b');expect(f.store.getState().navigation).toBeUndefined();
 expect(await selected).toBe(true);
 hold.resolve(Response.json({chat:conversation('b'),is_generating:false}));await Promise.resolve();
 expect(f.snapshots.every(snapshot=>snapshot.active==='b')).toBe(true);f.unsubscribe();
});

it('retains the presented chat during cold loading and publishes history, live state and identity together',async()=>{
 const hold=deferred(),f=await fixture(()=>hold.promise),selected=f.store.selectChat('b');
 expect(f.store.getState().active).toBe('a');expect(f.store.getState().navigation).toMatchObject({chatId:'b',status:'loading'});
 hold.resolve(Response.json({chat:conversation('b'),is_generating:true,snapshot:{text:'Recovered partial',model:'model-b'}}));
 expect(await selected).toBe(true);
 const admitted=f.snapshots.filter(snapshot=>snapshot.active==='b');
 expect(admitted).toHaveLength(1);expect(admitted[0]).toMatchObject({branch:'main',model:'model-b',live:'Recovered partial',navigation:undefined});
 f.unsubscribe();
});

it('includes recovered queue acknowledgement in the same history/live admission',async()=>{
 const hold=deferred(),f=await fixture(()=>hold.promise);
 f.store.getState().queues.push({id:'b-q',chatId:'b',content:'Synthetic question',attachments:[],payload:{model:'model-b',expected_branch_id:'main'},failed:'Lost acknowledgement'});
 f.store.getState().lives.b={chat_id:'b',text:'Partial'};
 const selected=f.store.selectChat('b');hold.resolve(Response.json({chat:conversation('b'),is_generating:false}));await selected;
 expect(f.snapshots.filter(snapshot=>snapshot.active==='b')).toEqual([expect.objectContaining({live:undefined,queued:0,navigation:undefined})]);f.unsubscribe();
});

it('lets the latest cold request win and ignores an older response and error',async()=>{
 const b=deferred(),c=deferred(),f=await fixture(path=>path.endsWith('/b')?b.promise:c.promise);
 const toB=f.store.selectChat('b'),toC=f.store.selectChat('c');
 c.resolve(Response.json({chat:conversation('c'),is_generating:false}));expect(await toC).toBe(true);
 b.resolve(Response.json({detail:'Old request failed'},{status:502}));expect(await toB).toBe(false);
 expect(f.store.getState().active).toBe('c');expect(f.store.getState().error).toBe('');expect(f.store.getState().navigation).toBeUndefined();
 expect(f.snapshots.some(snapshot=>snapshot.active==='b')).toBe(false);f.unsubscribe();
});

it('keeps a navigation failure scoped to its target and retries without replacing the old view',async()=>{
 let healthy=false;const f=await fixture(()=>healthy?Response.json({chat:conversation('b'),is_generating:false}):Response.json({detail:'Unavailable target'},{status:503}));
 expect(await f.store.selectChat('b')).toBe(false);expect(f.store.getState().active).toBe('a');
 expect(f.store.getState().navigation).toMatchObject({chatId:'b',status:'error',error:'Unavailable target'});expect(f.store.getState().error).toBe('');
 healthy=true;expect(await f.store.selectChat('b')).toBe(true);expect(f.store.getState().active).toBe('b');expect(f.store.getState().navigation).toBeUndefined();f.unsubscribe();
});

it('new chat cancels a cold destination and prevents its late completion from returning',async()=>{
 const hold=deferred(),f=await fixture(()=>hold.promise),selected=f.store.selectChat('b');
 f.store.newChat();hold.resolve(Response.json({chat:conversation('b'),is_generating:false}));
 expect(await selected).toBe(false);expect(f.store.getState().active).toBe('new');expect(f.store.getState().navigation).toBeUndefined();f.unsubscribe();
});

it('clearing search cancels a pending search destination without clearing the displayed history',async()=>{
 const hold=deferred(),f=await fixture(()=>hold.promise),selected=f.store.openSearchResult({chat_id:'b',branch_id:'main',message_id:'b-main-answer'} as import('./chatSearch').SearchResult,'Synthetic');
 f.store.clearSearchTarget();hold.resolve(Response.json({chat:conversation('b'),is_generating:false}));
 expect(await selected).toBe(false);expect(f.store.getState().active).toBe('a');expect(f.store.getState().navigation).toBeUndefined();f.unsubscribe();
});

it('does not send into the source chat while a cold destination is being prepared',async()=>{
 const hold=deferred(),f=await fixture(()=>hold.promise),selected=f.store.selectChat('b');
 await expect(f.store.send('Synthetic draft',[])).rejects.toThrow();
 expect(f.store.currentChat()?.messages).toHaveLength(2);expect(f.store.getState().queues).toEqual([]);
 f.store.cancelChatNavigation();hold.resolve(Response.json({chat:conversation('b'),is_generating:false}));await selected;f.unsubscribe();
});

it('an account replacement cannot adopt the previous account cold response',async()=>{
 const hold=deferred(),f=await fixture(()=>hold.promise),selected=f.store.selectChat('b');
 Object.assign(f.store.getState(),{user:{id:2},active:'z',chats:[conversation('z')],navigation:undefined});
 hold.resolve(Response.json({chat:conversation('b'),is_generating:false}));expect(await selected).toBe(false);
 expect(f.store.getState().active).toBe('z');expect(f.store.getState().chats.map(item=>item.id)).toEqual(['z']);f.unsubscribe();
});

it('prepares the searched branch and search target before presenting any destination messages',async()=>{
 let branch='main';const f=await fixture((path,options)=>{
  if(path.endsWith('/branch')){branch=JSON.parse(String(options?.body)).branch_id;return Response.json({chat:conversation('b',branch)})}
  return Response.json({chat:conversation('b',branch),is_generating:false});
 });
 f.store.getState().chats.push(conversation('b'));
 expect(await f.store.openSearchResult({chat_id:'b',branch_id:'other',message_id:'b-other-answer'} as import('./chatSearch').SearchResult,'Synthetic')).toBe(true);
 const admitted=f.snapshots.filter(snapshot=>snapshot.active==='b');expect(admitted).toHaveLength(1);
 expect(admitted[0]).toMatchObject({branch:'other',search:{chatId:'b',messageId:'b-other-answer',query:'Synthetic'}});f.unsubscribe();
});

it('retries the failed searched branch with its original message and highlight query',async()=>{
 let branch='main',fail=true;const branches:string[]=[],f=await fixture((path,options)=>{
  if(path.endsWith('/branch')){
   const requested=JSON.parse(String(options?.body)).branch_id;branches.push(requested);
   if(fail)return Response.json({detail:'Synthetic branch failure'},{status:503});branch=requested;
  }
  return Response.json({chat:conversation('b',branch),is_generating:false});
 });
 f.store.getState().chats.push(conversation('b'));
 expect(await f.store.openSearchResult({chat_id:'b',branch_id:'other',message_id:'b-other-answer'} as import('./chatSearch').SearchResult,'Retained search')).toBe(false);
 expect(f.store.getState().active).toBe('a');expect(f.store.getState().navigation?.status).toBe('error');
 fail=false;expect(await f.store.retryChatNavigation()).toBe(true);
 expect(branches).toEqual(['other','other']);expect(f.store.currentChat()?.active_branch_id).toBe('other');
 expect(f.store.getState().searchTarget).toMatchObject({chatId:'b',messageId:'b-other-answer',query:'Retained search'});
 expect(await f.store.retryChatNavigation()).toBe(false);f.unsubscribe();
});

it('retries the failed branch selection without turning it into an ordinary chat open',async()=>{
 let branch='main',fail=true;const f=await fixture((path,options)=>{
  if(path.endsWith('/branch')){if(fail)return Response.json({detail:'Synthetic branch failure'},{status:503});branch=JSON.parse(String(options?.body)).branch_id}
  return Response.json({chat:conversation('a',branch),is_generating:false});
 });
 expect(await f.store.selectBranch('other')).toBe(false);expect(f.store.currentChat()?.active_branch_id).toBe('main');
 fail=false;expect(await f.store.retryChatNavigation()).toBe(true);expect(f.store.currentChat()?.active_branch_id).toBe('other');
 expect(f.store.getState().active).toBe('a');expect(f.store.getState().searchTarget).toBeUndefined();f.unsubscribe();
});

it('cannot revive a retry after cancellation or an account replacement',async()=>{
 const f=await fixture(()=>Response.json({detail:'Synthetic unavailable target'},{status:503}));
 expect(await f.store.selectChat('b')).toBe(false);f.store.cancelChatNavigation();
 let calls=vi.mocked(fetch).mock.calls.length;expect(await f.store.retryChatNavigation()).toBe(false);expect(vi.mocked(fetch).mock.calls).toHaveLength(calls);
 expect(await f.store.selectChat('b')).toBe(false);Object.assign(f.store.getState(),{user:{id:2},active:'z',chats:[conversation('z')]});
 calls=vi.mocked(fetch).mock.calls.length;expect(await f.store.retryChatNavigation()).toBe(false);expect(vi.mocked(fetch).mock.calls).toHaveLength(calls);
 expect(f.store.getState().active).toBe('z');f.unsubscribe();
});

it('captures the old rendered view before identity or branch commits and isolates failing bookmark listeners',async()=>{
 let branch='main';const f=await fixture((path,options)=>{
  if(path.endsWith('/branch'))branch=JSON.parse(String(options?.body)).branch_id;
  return Response.json({chat:conversation(path.endsWith('/b')?'b':'a',branch),is_generating:false});
 });
 const captures:string[]=[];
 const stop=f.store.subscribeBeforeChatViewChange((previous,next)=>{captures.push(`${previous.active}/${previous.chats.find(item=>item.id===previous.active)?.active_branch_id}->${next.active}/${next.chats.find(item=>item.id===next.active)?.active_branch_id}`);expect(f.store.getState()).toBe(previous)});
 const broken=f.store.subscribeBeforeChatViewChange(()=>{throw new Error('Storage unavailable')});
 await f.store.selectBranch('other');expect(captures).toEqual(['a/main->a/other']);
 f.store.getState().chats.push(conversation('b'));await f.store.selectChat('b');expect(captures.at(-1)).toBe('a/other->b/main');
 stop();broken();f.unsubscribe();
});
