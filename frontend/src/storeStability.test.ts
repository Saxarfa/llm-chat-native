import {afterEach,beforeEach,expect,it,vi} from 'vitest';

const chat=(content='Saved answer')=>({id:'c',title:'Chat',model_id:'m',active_branch_id:'main',messages:[{id:'u',role:'user',content:'Question'},{id:'a',role:'assistant',content}],createdAt:1,updatedAt:1,overrides:{}});
const deferred=()=>{let resolve!:(value:Response)=>void;const promise=new Promise<Response>(r=>{resolve=r});return {promise,resolve}};
beforeEach(()=>{
 vi.resetModules();
 vi.stubGlobal('location',{origin:'http://localhost:8000'});
 vi.stubGlobal('sessionStorage',{getItem:()=>null,setItem:vi.fn(),removeItem:vi.fn()});
 vi.stubGlobal('window',{dispatchEvent:vi.fn(),storageManager:{getSettings:()=>({model:'m'}),getAuthHeaders:()=>({'Content-Type':'application/json'}),setActiveChatId:vi.fn(),applyRemoteChat:vi.fn()}});
});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals()});

it('ignores an older poll that arrives after a newer live snapshot',async()=>{
 let hold=false;const history=deferred(),status=deferred();
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
  if(hold)return path.includes('/status/')?status.promise:history.promise;
  return Response.json(path.includes('/status/')?{is_generating:true,snapshot:{text:'New text'}}:{chat:chat('Newest saved answer')});
 }));
 const store=await import('./store');
 hold=true;const old=store.loadChat('c');hold=false;
 await store.loadChat('c');
 history.resolve(Response.json({chat:chat('Old saved answer')}));status.resolve(Response.json({is_generating:true,snapshot:{text:'Old text'}}));await old;
 expect(store.getState().lives.c.text).toBe('New text');
 expect(store.getState().chats[0].messages.at(-1)?.content).toBe('Newest saved answer');
});

it('does not discard live text if history was fetched just before completion',async()=>{
 let finishing=false;
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>Response.json(path.includes('/status/')
  ?{is_generating:!finishing,snapshot:{text:'Complete answer'}}
  :{chat:finishing?chat('History before completion'):chat()})));
 const store=await import('./store');await store.selectChat('c');
 finishing=true;
 // This response is a coherent server snapshot taken after completion.
 const impl=fetch;vi.stubGlobal('fetch',vi.fn(async(path:string)=>path.includes('/status/')
  ?Response.json({is_generating:false,chat:chat('Complete answer')}):impl(path)));
 await store.loadChat('c');
 expect(store.getState().lives.c).toBeUndefined();
 expect(store.currentChat()?.messages.at(-1)?.content).toBe('Complete answer');
});

it('does not recover or enqueue an old account request using the new account',async()=>{
 const sending=deferred();
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>path==='/api/chat/generate'?sending.promise:Response.json(path.includes('/status/')?{is_generating:false}:{chat:chat()})));
 const store=await import('./store');await store.selectChat('c');store.getState().user={id:1};
 const pending=store.send('Private question',[]);
 const next=store.getState();next.user={id:2};next.active='new';next.chats=[];next.lives={};next.queues=[];
 sending.resolve(Response.json({ok:true}));await pending;
 expect(store.getState().chats).toEqual([]);
 expect(store.getState().queues).toEqual([]);
 expect(store.getState().error).toBe('');
 expect(fetch).toHaveBeenCalledTimes(3);
});

async function connectedStore(handlers:(path:string,options:any)=>Response|Promise<Response>,initialQueues:any[]=[]){
 vi.useFakeTimers();
 vi.stubGlobal('document',{hidden:false,addEventListener:vi.fn()});
 window.addEventListener=vi.fn();
 const storage=window.storageManager;
 Object.assign(storage,{currentUser:{id:1},accountKey:(key:string)=>key+'-1',checkAuth:async()=>({ok:true,user:{id:1}}),getChats:()=>[chat()],saveChatsLocally:vi.fn(),refreshSettingsFromServer:async()=>true,clearAuthSession:vi.fn(),settingsWrite:Promise.resolve(),logout:async()=>{}});
 let interval:()=>void=()=>{};
 vi.stubGlobal('setInterval',vi.fn((fn:()=>void)=>{interval=fn;return 1}));
 const streams:ReadableStreamDefaultController<Uint8Array>[]=[],signals:AbortSignal[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(path==='/api/sync/events'){
   signals.push(options.signal);
   return new Response(new ReadableStream({start(controller){streams.push(controller);options.signal.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')))}}),{headers:{'Content-Type':'text/event-stream'}});
  }
  return handlers(path,options);
 }));
 const store=await import('./store');await store.init();
 store.getState().queues.push(...initialQueues);
 const event=(value:any)=>streams.at(-1)!.enqueue(new TextEncoder().encode('data: '+JSON.stringify(value)+'\n\n'));
 const settle=async()=>{for(let i=0;i<80;i++)await Promise.resolve()};
 await settle();
 return {store,event,settle,signals,poll:()=>interval(),streams};
}

it('reconciles inactive queued chats after reconnect and drains them once',async()=>{
 const queued={id:'queued',chatId:'c',content:'Next question',attachments:[],payload:{model:'m',expected_branch_id:'main'}};
 let generating=true;const sent:string[]=[];
 const fixture=await connectedStore((path,options)=>{
  if(path==='/api/chats')return Response.json({chats:[chat()]});
  if(path==='/api/chat/generate'){sent.push(JSON.parse(options.body).message);return Response.json({ok:true})}
  if(path.includes('/status/'))return Response.json({is_generating:generating,snapshot:{text:'Partial'},...(!generating?{chat:chat('Finished')}: {})});
  if(path==='/api/chats/c')return Response.json({chat:chat()});
  return Response.json({ok:true});
 },[queued]);
 fixture.event({type:'connected'});await fixture.settle();
 expect(fixture.store.getState().lives.c.text).toBe('Partial');expect(sent).toEqual([]);
 generating=false;
 fixture.event({type:'connected'});await fixture.settle();
 expect(sent).toEqual(['Next question']);expect(fixture.store.getState().queues).toEqual([]);
 await fixture.store.logout();await fixture.settle();
});

it('polling recovers missed completion and drains a queue in an inactive chat',async()=>{
 const sent:string[]=[];
 const fixture=await connectedStore((path,options)=>{
  if(path==='/api/chat/generate'){sent.push(JSON.parse(options.body).message);return Response.json({ok:true})}
  if(path.includes('/status/'))return Response.json({is_generating:false,chat:chat('Done')});
  if(path==='/api/chats/c')return Response.json({chat:chat()});
  return Response.json({ok:true});
 });
 fixture.store.getState().lives.c={chat_id:'c',text:'Partial'};
 fixture.store.getState().queues.push({id:'queued',chatId:'c',content:'Continue',attachments:[],payload:{model:'m'}});
 fixture.poll();await fixture.settle();
 expect(sent).toEqual(['Continue']);expect(fixture.store.getState().queues).toEqual([]);
 await fixture.store.logout();await fixture.settle();
});

it('reconnects a silent hung event stream and stops its watchdog on logout',async()=>{
 const fixture=await connectedStore(()=>Response.json({ok:true}));
 expect(fixture.signals).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(45001);
 expect(fixture.signals[0].aborted).toBe(true);expect(fixture.signals).toHaveLength(2);
 await fixture.store.logout();await fixture.settle();
 expect(fixture.signals[1].aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
});

it('does not stack status polls when a slow connection takes longer than the polling interval',async()=>{
 const pending=deferred();let calls=0;
 const fixture=await connectedStore(path=>{
  if(path.includes('/status/')){calls++;return calls===1?pending.promise:Response.json({is_generating:false,chat:chat('Done')})}
  return Response.json({ok:true});
 });
 fixture.store.getState().lives.c={chat_id:'c',text:'Partial'};
 fixture.poll();fixture.poll();await fixture.settle();expect(calls).toBe(1);
 pending.resolve(Response.json({is_generating:false,chat:chat('Done')}));await fixture.settle();
 expect(fixture.store.getState().lives.c).toBeUndefined();
 fixture.store.getState().lives.c={chat_id:'c',text:'Another answer'};
 fixture.poll();await fixture.settle();expect(calls).toBe(2);
 await fixture.store.logout();await fixture.settle();
});

it('keeps a rejected send retryable with the same message id after HTTP 502',async()=>{
 let healthy=false;const sent:any[]=[];
 const fixture=await connectedStore((path,options)=>{
  if(path==='/api/chat/generate'){
   sent.push(JSON.parse(options.body));
   return healthy?Response.json({ok:true}):Response.json({detail:'Gateway unavailable'},{status:502});
  }
  if(path.includes('/status/'))return Response.json({is_generating:false,chat:chat()});
  return Response.json({ok:true});
 });
 await fixture.store.selectChat('c');await fixture.store.send('Retryable question',[]);
 const failed=fixture.store.getState().queues[0];
 expect(failed.failed).toBe('Gateway unavailable');
 expect(fixture.store.getState().lives.c).toBeUndefined();
 healthy=true;await fixture.store.retryQueue(failed.id);await fixture.settle();
 expect(fixture.store.getState().queues).toEqual([]);
 expect(sent.map(value=>value.message_id)).toEqual([failed.id,failed.id]);
 expect(fixture.store.getState().error).toBe('');
 await fixture.store.logout();await fixture.settle();
});

it('bounds a hung send and keeps it retryable instead of leaving a permanent spinner',async()=>{
 let healthy=false;const sent:any[]=[];
 const fixture=await connectedStore((path,options)=>{
  if(path==='/api/chat/generate'){
   sent.push(JSON.parse(options.body));
   if(healthy)return Response.json({ok:true});
   return new Promise<Response>((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason)));
  }
  if(path.includes('/status/'))return Response.json({is_generating:false,chat:chat()});
  return Response.json({ok:true});
 });
 vi.spyOn(AbortSignal,'timeout').mockImplementation(milliseconds=>{
  const controller=new AbortController();setTimeout(()=>controller.abort(new DOMException('Timed out','TimeoutError')),milliseconds);return controller.signal;
 });
 await fixture.store.selectChat('c');
 const sending=fixture.store.send('Timeout question',[]);
 await vi.advanceTimersByTimeAsync(25001);await sending;
 const failed=fixture.store.getState().queues[0];
 expect(failed.failed).toBeTruthy();expect(fixture.store.getState().lives.c).toBeUndefined();
 healthy=true;await fixture.store.retryQueue(failed.id);await fixture.settle();
 expect(fixture.store.getState().queues).toEqual([]);
 expect(sent.map(value=>value.message_id)).toEqual([failed.id,failed.id]);
 await fixture.store.logout();await fixture.settle();
});

it('removes a recovered queue item without replaying its accepted answer',async()=>{
 const queued={id:'queued-crash',chatId:'c',content:'Queued question',attachments:[],payload:{model:'m',expected_branch_id:'main'}};
 const recovered=chat();recovered.messages.push({id:queued.id,role:'user',content:queued.content},
  {id:'recovered',role:'assistant',content:'Checkpointed partial response.'});
 let sends=0;
 const fixture=await connectedStore(path=>{
  if(path==='/api/chat/generate'){sends++;return Response.json({ok:true,already_completed:true})}
  if(path.includes('/status/'))return Response.json({is_generating:false,chat:recovered});
  if(path==='/api/chats')return Response.json({chats:[recovered]});
  return Response.json({ok:true});
 },[queued]);
 await fixture.store.selectChat('c');
 fixture.store.getState().lives.c={chat_id:'c',text:'Partial before crash'};
 fixture.event({type:'connected'});await fixture.settle();
 fixture.event({type:'connected'});await fixture.settle();
 expect(sends).toBe(0);expect(fixture.store.getState().queues).toEqual([]);
 expect(fixture.store.getState().lives.c).toBeUndefined();
 expect(fixture.store.currentChat()?.messages.filter(message=>message.id===queued.id)).toHaveLength(1);
 await fixture.store.logout();await fixture.settle();
});

it('clears private state and aborts the stream when an established session expires',async()=>{
 const fixture=await connectedStore(()=>Response.json({ok:true}));
 fixture.store.getState().lives.c={chat_id:'c',text:'Private partial'};
 fixture.store.getState().queues.push({id:'private-queued',chatId:'c',content:'Private next',attachments:[],payload:{model:'m'}});
 fixture.event({type:'auth_expired'});await fixture.settle();
 const state=fixture.store.getState();
 expect(state.user).toBeNull();expect(state.chats).toEqual([]);
 expect(state.lives).toEqual({});expect(state.queues).toEqual([]);
 expect(window.storageManager.clearAuthSession).toHaveBeenCalledOnce();
 expect(fixture.signals[0].aborted).toBe(true);
});

it('clears a lost-ack failure when reconnect confirms a saved reply in an inactive chat',async()=>{
 const accepted=chat('Completed while offline');
 accepted.messages[0].id='accepted-question';
 const queued={id:'accepted-question',chatId:'c',content:'Question',attachments:[],payload:{model:'m',expected_branch_id:'main'},failed:'Failed to fetch'};
 let sends=0,statusCalls=0;
 const fixture=await connectedStore(path=>{
  if(path==='/api/chats')return Response.json({chats:[accepted]});
  if(path.includes('/status/')){statusCalls++;return Response.json({is_generating:false,chat:accepted})}
  if(path==='/api/chat/generate'){sends++;return Response.json({ok:true})}
  return Response.json({ok:true});
 },[queued]);
 fixture.store.getState().error=queued.failed;
 fixture.event({type:'connected'});await fixture.settle();
 expect(statusCalls).toBe(1);
 expect(fixture.store.getState().queues).toEqual([]);
 expect(fixture.store.getState().error).toBe('');
 expect(sends).toBe(0);
 await fixture.store.logout();await fixture.settle();
});

it('acknowledges a lost send while it is still generating without clearing another error',async()=>{
 const accepted=chat();accepted.messages=accepted.messages.slice(0,1);accepted.messages[0].id='accepted-question';
 const queued={id:'accepted-question',chatId:'c',content:'Question',attachments:[],payload:{model:'m',expected_branch_id:'main'},failed:'Failed to fetch'};
 const fixture=await connectedStore(path=>Response.json(path.includes('/status/')?{is_generating:true,chat:accepted,snapshot:{text:'Partial'}}:{ok:true}),[queued]);
 fixture.store.getState().error='A different failure';
 await fixture.store.loadChat('c');
 expect(fixture.store.getState().queues).toEqual([]);
 expect(fixture.store.getState().lives.c.text).toBe('Partial');
 expect(fixture.store.getState().error).toBe('A different failure');
 await fixture.store.logout();await fixture.settle();
});

it('retains unaccepted failures and failures from a different branch',async()=>{
 const accepted=chat();accepted.messages[0].id='accepted-question';
 const queued={id:'accepted-question',chatId:'c',content:'Question',attachments:[],payload:{model:'m',expected_branch_id:'another'},failed:'Failed to fetch'};
 const missing={...queued,id:'missing-question',payload:{model:'m',expected_branch_id:'main'}};
 const fixture=await connectedStore(path=>Response.json(path.includes('/status/')?{is_generating:false,chat:accepted}:{ok:true}),[queued,missing]);
 await fixture.store.loadChat('c');
 expect(fixture.store.getState().queues).toHaveLength(2);
 await fixture.store.logout();await fixture.settle();
});

it('clears a confirmed lost-ack failure on completion but preserves another failed request',async()=>{
 const accepted=chat();accepted.messages[0].id='accepted-question';
 const queued={id:'accepted-question',chatId:'c',content:'Question',attachments:[],payload:{model:'m',expected_branch_id:'main'},failed:'Failed to fetch'};
 const missing={...queued,id:'missing-question'};
 const fixture=await connectedStore(()=>Response.json({ok:true}),[queued,missing]);
 fixture.store.getState().error=queued.failed;
 fixture.event({type:'stream_end',chat_id:'c',chat:accepted});await fixture.settle();
 expect(fixture.store.getState().queues.map(item=>item.id)).toEqual(['missing-question']);
 expect(fixture.store.getState().error).toBe(queued.failed);
 expect(sessionStorage.setItem).toHaveBeenCalledWith('llm-react-queue-1',expect.any(String));
 await fixture.store.logout();await fixture.settle();
});

it('does not leave an error banner when a background history refresh loses the network',async()=>{
 const fixture=await connectedStore(path=>{
  if(path==='/api/chats/c')throw new TypeError('Failed to fetch');
  return Response.json({ok:true});
 });
 fixture.event({type:'stream_start',chat_id:'c',model:'m'});await fixture.settle();
 expect(fixture.store.getState().error).toBe('');
 fixture.event({type:'stream_end',chat_id:'c',chat:chat('Complete')});await fixture.settle();
 expect(fixture.store.getState().lives.c).toBeUndefined();
 expect(fixture.store.getState().error).toBe('');
 await fixture.store.logout();await fixture.settle();
});

it('keeps a background model gateway failure quiet while reconnecting',async()=>{
 const fixture=await connectedStore(path=>Response.json(path==='/api/chats/c'?{detail:'Server failure'}:{ok:true},{status:path==='/api/chats/c'?502:200}));
 fixture.event({type:'stream_start',chat_id:'c',model:'m'});await fixture.settle();
 expect(fixture.store.getState().error).toBe('');
 await fixture.store.logout();await fixture.settle();
});

it('still reports an actionable HTTP conflict during a background history refresh',async()=>{
 const fixture=await connectedStore(path=>Response.json(path==='/api/chats/c'?{detail:'History conflict'}:{ok:true},{status:path==='/api/chats/c'?409:200}));
 fixture.event({type:'stream_start',chat_id:'c',model:'m'});await fixture.settle();
 expect(fixture.store.getState().error).toBe('History conflict');
 await fixture.store.logout();await fixture.settle();
});

it('does not adopt an old profile response after logout and account switch',async()=>{
 const fixture=await connectedStore(()=>Response.json({ok:true}));
 const pending=deferred();
 window.storageManager.updateProfile=vi.fn(async()=>{await pending.promise;return {id:1,display_name:'Old profile'}});
 const updating=fixture.store.updateAccount('Changed','');
 const result=expect(updating).rejects.toThrow('Аккаунт изменился');
 fixture.store.getState().user={id:2};
 pending.resolve(Response.json({ok:true}));await result;
 expect(fixture.store.getState().user?.id).toBe(2);
 await fixture.store.logout();await fixture.settle();
});

it('keeps settled history stable across status polls and still applies a changed answer',async()=>{
 let content='Saved answer';
 const fixture=await connectedStore(path=>Response.json(path.includes('/status/')?{is_generating:true,chat:chat(content),snapshot:{text:'Growing live reply'}}:{ok:true}));
 await fixture.store.selectChat('c');
 const previous=fixture.store.currentChat()!;
 const list=fixture.store.getState().chats;
 const writes=vi.mocked(window.storageManager.applyRemoteChat).mock.calls.length;
 await fixture.store.loadChat('c');
 expect(fixture.store.currentChat()).toBe(previous);
 expect(fixture.store.getState().chats).toBe(list);
 expect(window.storageManager.applyRemoteChat).toHaveBeenCalledTimes(writes);
 expect(fixture.store.getState().lives.c.text).toBe('Growing live reply');
 content='Edited answer';await fixture.store.loadChat('c');
 const changed=fixture.store.currentChat()!;
 expect(changed.messages[0]).toBe(previous.messages[0]);
 expect(changed.messages[1].content).toBe(content);
 expect(changed.messages[1]).not.toBe(previous.messages[1]);
 await fixture.store.logout();await fixture.settle();
});

it('coalesces reconnect bursts and refreshes again after a delayed old snapshot',async()=>{
 const old=deferred();let hold=false,reads=0;
 const fixture=await connectedStore(path=>{
  if(path==='/api/chats'){
   reads++;if(hold&&reads===1)return old.promise;
   return Response.json({chats:[chat('Latest saved answer')]});
  }
  return Response.json({ok:true});
 });
 hold=true;
 for(let i=0;i<5;i++)fixture.event({type:'connected'});
 await fixture.settle();expect(reads).toBe(1);
 old.resolve(Response.json({chats:[chat('Old saved answer')]}));await fixture.settle();
 expect(reads).toBe(2);
 expect(fixture.store.getState().chats[0].messages.at(-1)?.content).toBe('Latest saved answer');
 expect(window.storageManager.saveChatsLocally).toHaveBeenCalledOnce();
 expect(window.storageManager.saveChatsLocally).toHaveBeenCalledWith([chat('Latest saved answer')]);
 fixture.event({type:'connected'});await fixture.settle();expect(reads).toBe(3);
 await fixture.store.logout();await fixture.settle();
});

it('recovers a failed superseded history refresh with the queued refresh',async()=>{
 const old=deferred();let reads=0;
 const fixture=await connectedStore(path=>{
  if(path==='/api/chats')return ++reads===1?old.promise:Response.json({chats:[chat('Recovered after reconnect')]});
  return Response.json({ok:true});
 });
 fixture.event({type:'connected'});fixture.event({type:'connected'});await fixture.settle();
 old.resolve(Response.json({detail:'Gateway unavailable'},{status:502}));await fixture.settle();
 expect(reads).toBe(2);expect(fixture.store.getState().error).toBe('');
 expect(fixture.store.getState().chats[0].messages.at(-1)?.content).toBe('Recovered after reconnect');
 await fixture.store.logout();await fixture.settle();
});

it('preserves pending parameter edits when reconnect replaces the chat list',async()=>{
 const saving=deferred();let saved=chat();
 const fixture=await connectedStore((path,options)=>{
  if(options?.method==='PUT')return saving.promise;
  if(path==='/api/chats')return Response.json({chats:[saved]});
  if(path.includes('/status/'))return Response.json({is_generating:false,chat:saved});
  return Response.json({ok:true});
 });
 const overrides={m:{temperature:0.65}};
 const pending=fixture.store.saveOverrides(overrides,'c');await fixture.settle();
 fixture.event({type:'connected'});await fixture.settle();
 expect(fixture.store.getState().chats[0].overrides).toEqual(overrides);
 saved={...saved,overrides};saving.resolve(Response.json({ok:true}));await pending;
 expect(fixture.store.getState().chats[0].overrides).toEqual(overrides);
 await fixture.store.logout();await fixture.settle();
});

it('coalesces overlapping model refreshes and uses the newest catalog',async()=>{
 const old=deferred();let requests=0;
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  const first=++requests<=5;
  if(first)await old.promise;
  if(path==='/api/inference/probe')return Response.json(JSON.parse(options.body).kind==='models'
   ?{raw:{data:[{id:first?'old-model':'new-model'}]}}:{ok:true});
  return Response.json({models:[]});
 }));
 const store=await import('./store');
 const jobs=Array.from({length:5},()=>store.refreshModels());
 expect(requests).toBe(5);
 old.resolve(Response.json({ok:true}));await Promise.all(jobs);
 expect(requests).toBe(10);expect(store.getState().models.map(model=>model.id)).toEqual(['new-model']);
 const previous=store.getState().models;
 await store.refreshModels();expect(store.getState().models).toBe(previous);
});

it('does not block a new account model refresh behind an old pending request',async()=>{
 const old=deferred();let requests=0;
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  const first=++requests<=5;
  if(first)await old.promise;
  if(path==='/api/inference/probe')return Response.json(JSON.parse(options.body).kind==='models'
   ?{raw:{data:[{id:first?'old-account-model':'new-account-model'}]}}:{ok:true});
  return Response.json({models:[]});
 }));
 const store=await import('./store');store.getState().user={id:1};
 const pending=store.refreshModels();store.getState().user={id:2};
 await store.refreshModels();expect(requests).toBe(10);
 expect(store.getState().models.map(model=>model.id)).toEqual(['new-account-model']);
 old.resolve(Response.json({ok:true}));await pending;
 expect(store.getState().models.map(model=>model.id)).toEqual(['new-account-model']);
});

it('keeps a just-sent question when an older status poll lands after the send',async()=>{
 // Recording 08.11.2026: a recovery poll left before the send and answered with
 // the pre-send history (idle). It wiped the optimistic question and the live row
 // for the whole generation, until stream_end brought the question back.
 let hold=false;const status=deferred();
 vi.stubGlobal('fetch',vi.fn(async(path:string,options?:RequestInit)=>{
  if(path.includes('/status/'))return hold?status.promise:Response.json({is_generating:false,chat:chat()});
  if(path.includes('/api/chat/generate'))return new Promise<Response>(()=>{});
  return Response.json({chat:chat(),chats:[chat()],settings:{model:'m'},ok:true});
 }));
 const store=await import('./store');await store.selectChat('c');
 hold=true;const poll=store.loadChat('c');hold=false;
 void store.send('Follow-up',[]);
 const sent=store.currentChat()?.messages.at(-1);
 expect(sent?.content).toBe('Follow-up');
 status.resolve(Response.json({is_generating:false,chat:chat()}));await poll;
 expect(store.currentChat()?.messages.at(-1)?.id).toBe(sent?.id);
 expect(store.getState().lives.c).toBeDefined();
});
