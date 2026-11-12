import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const fixtures=()=>({id:'c',title:'Chat',model_id:'m',messages:[],createdAt:1,updatedAt:1,overrides:{}});
beforeEach(()=>{
 vi.resetModules();
 vi.stubGlobal('window',{dispatchEvent:vi.fn(),storageManager:{getSettings:()=>({model:'m'}),getAuthHeaders:()=>({'Content-Type':'application/json'}),setActiveChatId:vi.fn(),applyRemoteChat:vi.fn()}});
});
afterEach(()=>vi.unstubAllGlobals());
it('pins with a metadata patch and ignores a delayed pre-pin history load',async()=>{
 const original={...fixtures(),pinned:false};let hold=false,release:((response:Response)=>void)|undefined;const requests:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(options?.method==='PATCH'){requests.push({path,body:JSON.parse(options.body)});return Response.json({ok:true,pinned:true,updated_at:1})}
  if(path.includes('/status/'))return Response.json({is_generating:false});
  if(hold){hold=false;return new Promise<Response>(resolve=>{release=resolve})}
  return Response.json({chat:original});
 }));
 const store=await import('./store');await store.selectChat('c');
 hold=true;const loading=store.loadChat('c');await store.metadata('c',{pinned:true});
 release!(Response.json({chat:original}));await loading;
 expect(requests).toEqual([{path:'/api/chats/c/metadata',body:{pinned:true}}]);
 expect(store.currentChat()?.pinned).toBe(true);
 expect(store.currentChat()?.updatedAt).toBe(1);
 expect(window.storageManager.applyRemoteChat).toHaveBeenLastCalledWith({...original,pinned:true,title_source:undefined,title_version:undefined});
});
it('keeps pin state unchanged if the server rejects the change',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>options?.method==='PATCH'?Response.json({detail:'Нет соединения'},{status:503}):Response.json(path.includes('/status/')?{is_generating:false}:{chat:{...fixtures(),pinned:true}})));
 const store=await import('./store');await store.selectChat('c');
 await expect(store.metadata('c',{pinned:false})).rejects.toThrow('Нет соединения');
 expect(store.currentChat()?.pinned).toBe(true);
});
it('drains queued messages even when an answer finishes before the send request settles',async()=>{
 vi.stubGlobal('location',{origin:'http://localhost:8000'});
 let generating=true,current:any=fixtures();const sent:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(path==='/api/chat/generate'){
   const payload=JSON.parse(options.body);sent.push(payload.message);
   current={...current,messages:[...current.messages,{id:payload.message_id,role:'user',content:payload.message},{id:'a-'+sent.length,role:'assistant',content:'Done'}]};return Response.json({ok:true});
  }
  return Response.json(path.includes('/status/')?{is_generating:generating,snapshot:{text:''}}:{chat:current});
 }));
 const store=await import('./store');await store.selectChat('c');
 await store.send('first',[]);await store.send('second',[]);
 expect(store.getState().queues).toHaveLength(2);
 generating=false;await store.loadChat('c');
 await store.retryQueue(store.getState().queues[0].id);
 await vi.waitFor(()=>expect(store.getState().queues).toHaveLength(0));
 expect(sent).toEqual(['first','second']);
});
it('removes pending retries when their chat is deleted and rejects a delayed old history load',async()=>{
 let hold=false,release:((response:Response)=>void)|undefined;
 const original:any=fixtures();
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(options?.method==='DELETE')return Response.json({ok:true});
  if(path.includes('/status/'))return Response.json({is_generating:false});
  if(hold){hold=false;return new Promise<Response>(resolve=>{release=resolve})}
  return Response.json({chat:original});
 }));
 const store=await import('./store');await store.selectChat('c');
 store.getState().queues.push({id:'queued',chatId:'c',content:'Keep until deletion',attachments:[],payload:{},failed:'offline'});
 hold=true;const loading=store.loadChat('c');
 await store.deleteChat('c');release!(Response.json({chat:original}));await loading;
 expect(store.getState().queues).toHaveLength(0);expect(store.getState().chats).toHaveLength(0);
});
it('deletes a message using the active branch and applies the authoritative remaining messages',async()=>{
 let current:any={...fixtures(),active_branch_id:'branch-b',messages:[{id:'u',role:'user',content:'Question'},{id:'a',role:'assistant',content:'Answer'}]};
 let release:((response:Response)=>void)|undefined;const requests:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(options?.method==='DELETE'){requests.push({path,body:JSON.parse(options.body)});return new Promise<Response>(resolve=>{release=resolve})}
  return Response.json(path.includes('/status/')?{is_generating:false}:{chat:current});
 }));
 const store=await import('./store');await store.selectChat('c');
 const deleting=store.deleteMessage('u');
 expect(store.currentChat()?.messages).toHaveLength(2);
 expect(requests).toEqual([{path:'/api/chats/c/messages/u',body:{expected_branch_id:'branch-b'}}]);
 current={...current,messages:[current.messages[1]],updatedAt:2};release!(Response.json({chat:current}));await deleting;
 expect(store.currentChat()?.messages).toEqual(current.messages);
 expect(window.storageManager.applyRemoteChat).toHaveBeenLastCalledWith(current);
});
it('uses the server branch fallback after deletion and leaves messages unchanged on rejection',async()=>{
 const original:any={...fixtures(),active_branch_id:'child',messages:[{id:'a',role:'assistant',content:'Child answer'}]};
 const parent:any={...fixtures(),active_branch_id:'main',messages:[{id:'u',role:'user',content:'Parent question'}]};let current=original;const requests:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(options?.method==='DELETE'){
   requests.push({path,body:JSON.parse(options.body)});
   if(path.includes('/messages/'))return Response.json({detail:'Ветка переписки изменилась'},{status:409});
   current=parent;return Response.json({chat:current});
  }
  return Response.json(path.includes('/status/')?{is_generating:false}:{chat:current});
 }));
 const store=await import('./store');await store.selectChat('c');
 await expect(store.deleteMessage('a')).rejects.toThrow('Ветка переписки изменилась');
 expect(store.currentChat()?.messages).toEqual(original.messages);
 await store.deleteBranch('child');
 expect(requests[1]).toEqual({path:'/api/chats/c/branches/child',body:{expected_branch_id:'child'}});
 expect(store.currentChat()?.active_branch_id).toBe('main');expect(store.currentChat()?.messages).toEqual(parent.messages);
});
it('refuses deletion while the current chat is generating',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>Response.json(path.includes('/status/')?{is_generating:true,snapshot:{text:''}}:{chat:fixtures()})));
 const store=await import('./store');await store.selectChat('c');
 await expect(store.deleteMessage('a')).rejects.toThrow('Дождитесь');
 await expect(store.deleteBranch('main')).rejects.toThrow('Дождитесь');
 expect(fetch).toHaveBeenCalledTimes(2);
});
it('sends a saved follow-up once as an ordinary user turn with the current branch',async()=>{
 vi.stubGlobal('location',{origin:'http://localhost:8000'});
 const events:string[]=[];window.dispatchEvent=(event:Event)=>{events.push(event.type);return true};
 let current:any={...fixtures(),active_branch_id:'branch-2',messages:[{id:'a',role:'assistant',content:'Answer',timestamp:2,suggestions:['Tell me more','Give an example','Compare alternatives']}]};
 const requests:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(path==='/api/chat/generate'){const payload=JSON.parse(options.body);requests.push(payload);current={...current,messages:[...current.messages,{id:payload.message_id,role:'user',content:payload.message,timestamp:3}]};return Response.json({ok:true})}
  return Response.json(path.includes('/status/')?{is_generating:true,snapshot:{text:''}}:{chat:current});
 }));
 const store=await import('./store');
 // Selecting an idle, saved answer before clicking.
 const fetchImpl=fetch;vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>path.includes('/status/')?Response.json({is_generating:false}):fetchImpl(path,options)));
 await store.selectChat('c');
 expect(await store.sendSuggestion('wrong-id','Tell me more')).toBe(false);
 expect(await store.sendSuggestion('a','Made up text')).toBe(false);
 expect(await store.sendSuggestion('a','Tell me more')).toBe(true);
 expect(await store.sendSuggestion('a','Tell me more')).toBe(false);
 expect(requests).toHaveLength(1);
 expect(requests[0].message).toBe('Tell me more');
 expect(requests[0].expected_branch_id).toBe('branch-2');
 expect(events).toEqual(['suggestion-sent']);
 const motion=await import('./messageMotion');
 expect(motion.sentMessageMotion(current.messages.at(-1).id)).toBe('suggestion');
 expect(motion.sentMessageMotion('a')).toBeNull();
});
it('hides and refuses follow-up sending when disabled',async()=>{
 window.storageManager.getSettings=()=>({model:'m',chatSuggestions:false});
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>Response.json(path.includes('/status/')?{is_generating:false}:{chat:{...fixtures(),messages:[{id:'a',role:'assistant',content:'Answer',suggestions:['One','Two','Three']}]}})));
 const store=await import('./store');await store.selectChat('c');
 expect(await store.sendSuggestion('a','One')).toBe(false);
 expect(fetch).toHaveBeenCalledTimes(2);
});
it('starts the regeneration layout before the request and keeps it until the live answer finishes',async()=>{
 vi.stubGlobal('location',{origin:'http://localhost:8000'});
 const events:any[]=[];window.dispatchEvent=(event:Event)=>{events.push({type:event.type,detail:(event as CustomEvent).detail});return true};
 const original={...fixtures(),messages:[{id:'a',role:'assistant' as const,content:'Old answer',timestamp:2}]};let generating=false;
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
  if(path==='/api/chat/regenerate'){expect(events[0].type).toBe('chat-regeneration-start');generating=true;return Response.json({ok:true})}
  return Response.json(path.includes('/status/')?{is_generating:generating,snapshot:{target_message_id:'a'}}:{chat:original});
 }));
 const store=await import('./store');await store.selectChat('c');await store.regenerate(original.messages[0]);
 expect(events).toEqual([{type:'chat-regeneration-start',detail:{chatId:'c',messageId:'a'}},{type:'chat-regeneration-settled',detail:{chatId:'c',messageId:'a',generating:true}}]);
 expect(store.getState().lives.c.target_message_id).toBe('a');
});
it('releases the reserved answer space when regeneration is rejected',async()=>{
 vi.stubGlobal('location',{origin:'http://localhost:8000'});
 const events:any[]=[];window.dispatchEvent=(event:Event)=>{events.push({type:event.type,detail:(event as CustomEvent).detail});return true};
 const original={...fixtures(),messages:[{id:'a',role:'assistant' as const,content:'Saved answer',timestamp:2}]};
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>path==='/api/chat/regenerate'?Response.json({detail:'Busy'},{status:409}):Response.json(path.includes('/status/')?{is_generating:false}:{chat:original})));
 const store=await import('./store');await store.selectChat('c');await expect(store.regenerate(original.messages[0])).rejects.toThrow('Busy');
 expect(events[1]).toEqual({type:'chat-regeneration-settled',detail:{chatId:'c',messageId:'a',generating:false}});
 expect(store.currentChat()?.messages).toEqual(original.messages);
});
it('uses the saved default for a new chat without changing existing chat models',async()=>{
 let settings={model:'m'};
 window.storageManager.getSettings=()=>settings;
 window.storageManager.saveSettings=(patch:typeof settings)=>{settings={...settings,...patch}};
 window.storageManager.settingsWrite=Promise.resolve();
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>Response.json(path.includes('/status/')?{is_generating:false}:{chat:fixtures()})));
 const store=await import('./store');
 await store.selectModel('temporary');
 store.newChat();expect(store.activeModel()).toBe('m');
 await store.selectChat('c');
 await store.saveSettings({model:'preferred'});
 expect(store.activeModel()).toBe('m');
 store.newChat();expect(store.activeModel()).toBe('preferred');
 expect(store.getState().chats[0].model_id).toBe('m');
});
it('remembers reasoning per model across new chats and reloads, preserving other settings',async()=>{
 let settings:any={model:'google-subscription/gemini-3.8-flash',modelConfigs:{'google-subscription/gemini-3.8-flash':{temperature:.4},'muse-glimmer-30b':{reasoning_strength:'high'}}};
 window.storageManager.getSettings=()=>settings;
 window.storageManager.saveSettings=(patch:any)=>{settings={...settings,...patch}};
 window.storageManager.settingsWrite=Promise.resolve();
 vi.stubGlobal('location',{origin:'http://localhost:8000'});
 let store=await import('./store');
 await store.saveReasoning('google-subscription/gemini-3.8-flash',{reasoning_strength:'low'});
 store.newChat();
 expect(store.inferencePayload().settings.reasoning_strength).toBe('low');
 expect(store.inferencePayload().settings.temperature).toBe(.4);
 await store.selectModel('muse-glimmer-30b');
 expect(store.inferencePayload().settings.reasoning_strength).toBe('high');
 await store.saveReasoning('muse-glimmer-30b',{reasoning_strength:'medium'});
 await store.selectModel('google-subscription/gemini-3.8-flash');
 expect(store.inferencePayload().settings.reasoning_strength).toBe('low');
 vi.resetModules();store=await import('./store');
 expect(store.inferencePayload().settings.reasoning_strength).toBe('low');
 await store.selectModel('muse-glimmer-30b');
 expect(store.inferencePayload().settings.reasoning_strength).toBe('medium');
});
it('saves reasoning to the current chat without removing its other overrides',async()=>{
 let settings:any={model:'qwen-3.8-27b-it'};
 window.storageManager.getSettings=()=>settings;
 window.storageManager.saveSettings=(patch:any)=>{settings={...settings,...patch}};
 window.storageManager.settingsWrite=Promise.resolve();
 let current:any={...fixtures(),model_id:'qwen-3.8-27b-it',overrides:{searchMode:'auto','qwen-3.8-27b-it':{temperature:.5}}};
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(options?.method==='PUT'){current={...current,overrides:JSON.parse(options.body).overrides};return Response.json({ok:true})}
  return Response.json(path.includes('/status/')?{is_generating:false}:{chat:current});
 }));
 const store=await import('./store');await store.selectChat('c');
 await store.saveReasoning('qwen-3.8-27b-it',{thinking:true,reasoning_effort:'medium'});
 expect(store.overrides()).toEqual({searchMode:'auto','qwen-3.8-27b-it':{temperature:.5,thinking:true,reasoning_effort:'medium'}});
 store.newChat();
 expect(store.getState().settings.modelConfigs['qwen-3.8-27b-it']).toEqual({thinking:true,reasoning_effort:'medium'});
});
it('serializes rapid chat overrides and persists the newest state',async()=>{
 let saved:any={},concurrent=0,maximum=0;const writes:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(options.method==='PUT'){
   maximum=Math.max(maximum,++concurrent);
   const value=JSON.parse(options.body).overrides;
   await new Promise(resolve=>setTimeout(resolve,10));saved=value;writes.push(value);concurrent--;
   return Response.json({ok:true});
  }
  return Response.json(path.includes('/status/')?{is_generating:false}:{chat:{...fixtures(),overrides:saved}});
 }));
 const store=await import('./store');await store.selectChat('c');
 await Promise.all([store.saveOverrides({m:{temperature:.3}}),store.saveOverrides({m:{temperature:.4}}),store.saveOverrides({m:{temperature:.5},searchMode:'auto'})]);
 expect(maximum).toBe(1);expect(writes).toHaveLength(3);
 expect(saved).toEqual({m:{temperature:.5},searchMode:'auto'});
 expect(store.overrides()).toEqual(saved);
});
it('generates a title using the chosen chat model without replacing messages or its timestamp',async()=>{
 vi.stubGlobal('location',{origin:'http://localhost:8000'});
 const original={...fixtures(),model_id:'gemma-26b-qat',messages:[{id:'u',role:'user',content:'Кофе',timestamp:1},{id:'a',role:'assistant',content:'Бодрит',timestamp:2}]};
 let current=original;const requests:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(path.endsWith('/title')){requests.push(JSON.parse(options.body));current={...original,title:'Польза утреннего кофе'};return Response.json({chat:current})}
  return Response.json(path.includes('/status/')?{is_generating:false}:{chat:current});
 }));
 const store=await import('./store');await store.selectChat('c');
 await store.generateTitle('c');
 expect(requests[0].model).toBe('gemma-26b-qat');
 expect(requests[0]).not.toHaveProperty('system_prompt');
 expect(store.currentChat()?.title).toBe('Польза утреннего кофе');
 expect(store.currentChat()?.messages).toEqual(original.messages);
 expect(store.currentChat()?.updatedAt).toBe(original.updatedAt);
});
it('recovers an accepted request after a transport timeout without queuing a duplicate',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
  if(path==='/api/chat/generate')throw new Error('Response lost');
  return Response.json(path.includes('/status/')?{is_generating:false}:{chat:{...fixtures(),messages:[{id:'request',role:'user',content:'Hi'},{id:'response',role:'assistant',content:'Hello'}]}});
 }));
 const store=await import('./store');
 await expect(store.transmit({id:'request',chatId:'c',content:'Hi',attachments:[],payload:{model:'m'}})).resolves.toBeUndefined();
 expect(store.getState().queues).toHaveLength(0);
 expect(store.getState().chats[0].messages).toHaveLength(2);
});

it('starts a preset as an isolated draft and sends the actual model with its frozen config',async()=>{
 vi.stubGlobal('location',{origin:'http://localhost:8000'});
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const store=await import('./store');
 const preset={id:'writer',name:'Автор',cover:'',model_id:'gemma-26b-qat',config:{temperature:.35,systemPrompt:'Write',thinking:false,searchMode:'auto'},image_settings:{width:768,height:1024,steps:24}};
 store.startPreset(preset);preset.config.temperature=1.5;
 const payload=store.inferencePayload();
 expect(store.activeModel()).toBe('gemma-26b-qat');
 expect(payload.settings.temperature).toBe(.35);
 expect(payload.thinking).toBe(false);
 expect(payload.search_mode).toBe('auto');
 expect(payload.overrides.imageSettings.width).toBe(768);
 expect(fetcher).not.toHaveBeenCalled();
 store.newChat();expect(store.activeModel()).toBe('m');expect(store.overrides()).toEqual({});
});

it('branches through the server and includes the active branch when changing or generating',async()=>{
 vi.stubGlobal('location',{origin:'http://localhost:8000'});
 let current={...fixtures(),active_branch_id:'main',branches:[{id:'main',name:'Основная',parent_id:null,fork_message_id:null,created_at:1,message_count:0}]};
 const requests:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(options.body)requests.push({path,body:JSON.parse(options.body)});
  if(path.endsWith('/branches'))current={...current,active_branch_id:'branch2'};
  if(path.endsWith('/branch'))current={...current,active_branch_id:'main'};
  return Response.json(path.includes('/status/')?{is_generating:false}:{chat:current});
 }));
 const store=await import('./store');await store.selectChat('c');
 await store.forkBranch('u');expect(store.currentChat()?.active_branch_id).toBe('branch2');
 expect(requests[0].body).toEqual({message_id:'u',expected_branch_id:'main'});
 expect(store.inferencePayload().expected_branch_id).toBe('branch2');
 await store.selectBranch('main');expect(requests[1].body).toEqual({branch_id:'main',expected_branch_id:'branch2'});
 expect(store.currentChat()?.active_branch_id).toBe('main');
});

it('rejects a stale queued request while preserving a different branch live response',async()=>{
 const other={...fixtures(),active_branch_id:'branch-b',messages:[{id:'other-request',role:'user',content:'Other branch'}]};
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
  if(path==='/api/chat/generate')return Response.json({detail:'Ветка переписки изменилась'},{status:409});
  return Response.json(path.includes('/status/')
   ?{is_generating:true,snapshot:{user_message:{id:'other-request'},phase:'Генерация в другой ветке'}}
   :{chat:other});
 }));
 const store=await import('./store');
 const pending={id:'my-queued-request',chatId:'c',content:'Keep this message',attachments:[],payload:{model:'m',expected_branch_id:'main'}};
 await expect(store.transmit(pending)).rejects.toThrow('Ветка переписки изменилась');
 expect(store.getState().chats[0].active_branch_id).toBe('branch-b');
 expect(store.getState().lives.c?.phase).toBe('Генерация в другой ветке');
 expect(store.getState().lives.c?.user_message?.id).toBe('other-request');
});

it('keeps a rejected message available for retry instead of treating another branch stream as acceptance',async()=>{
 vi.stubGlobal('location',{origin:'http://localhost:8000'});
 let current:any={...fixtures(),active_branch_id:'main'},generating=false;
 let sent:any;
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(path==='/api/chat/generate'){
   sent=JSON.parse(options.body);generating=true;
   current={...fixtures(),active_branch_id:'branch-b',messages:[{id:'other',role:'user',content:'Remote message'}]};
   return Response.json({detail:'Ветка переписки изменилась'},{status:409});
  }
  return Response.json(path.includes('/status/')
   ?{is_generating:generating,snapshot:generating?{user_message:{id:'other'},phase:'Remote stream'}:undefined}
   :{chat:current});
 }));
 const store=await import('./store');await store.selectChat('c');
 await store.send('Do not lose my message',[]);
 expect(sent.expected_branch_id).toBe('main');
 expect(store.getState().queues).toHaveLength(1);
 expect(store.getState().queues[0]).toMatchObject({id:sent.message_id,content:'Do not lose my message',failed:'Ветка переписки изменилась',payload:{expected_branch_id:'main'}});
 expect(store.getState().lives.c?.phase).toBe('Remote stream');
});

it('ignores a delayed old chat fetch after a branch switch succeeds without an SSE event',async()=>{
 const main={...fixtures(),active_branch_id:'main',messages:[{id:'main-message',role:'user',content:'Original'}]};
 const branch={...fixtures(),updatedAt:2,active_branch_id:'branch-b',messages:[{id:'branch-message',role:'user',content:'Branch'}]};
 let current=main,holdNext=false;
 let release:((response:Response)=>void)|undefined;
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
  if(path.endsWith('/branch')){current=branch;return Response.json({chat:branch})}
  if(path.includes('/status/'))return Response.json({is_generating:false});
  if(holdNext){holdNext=false;return new Promise<Response>(resolve=>{release=resolve})}
  return Response.json({chat:current});
 }));
 const store=await import('./store');await store.selectChat('c');
 holdNext=true;const oldLoad=store.loadChat('c');
 await vi.waitFor(()=>expect(release).toBeDefined());
 await store.selectBranch('branch-b');
 expect(store.currentChat()?.active_branch_id).toBe('branch-b');
 release!(Response.json({chat:main}));await oldLoad;
 expect(store.currentChat()?.active_branch_id).toBe('branch-b');
 expect(store.currentChat()?.messages[0].content).toBe('Branch');
});


it('selects an actor in the draft without changing the default model and clears it for a plain model',async()=>{
 const store=await import('./store');
 await store.selectPreset({id:'actor',name:'Writer',cover:'',model_id:'actor-model',config:{temperature:.2,systemPrompt:'Write stories'},image_settings:{steps:30}});
 expect(store.activeModel()).toBe('actor-model');
 expect(store.overrides().workspacePreset.name).toBe('Writer');
 expect(store.overrides().imageSettings.steps).toBe(30);
 expect(store.getState().settings.model).toBe('m');
 await store.selectModel('actor-model');
 expect(store.overrides().workspacePreset).toBeUndefined();
 expect(store.overrides()['actor-model']).toBeUndefined();
 expect(store.getState().settings.model).toBe('m');
});

it('restores a trashed chat from the authoritative snapshot and clears undo',async()=>{
 const saved={...fixtures(),pinned:true,folder_id:'work',messages:[{id:'u',role:'user',content:'Keep me',timestamp:2}]};
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>Response.json(options?.method==='DELETE'?{ok:true}:path.includes('/status/')?{is_generating:false}:{chat:saved})));
 const store=await import('./store');await store.selectChat('c');await store.deleteChat('c');
 expect(store.getState().undoChat?.id).toBe('c');expect(store.getState().chats).toHaveLength(0);
 await store.restoreChat('c');expect(store.getState().chats[0]).toEqual(saved);expect(store.getState().undoChat).toBeUndefined();
});
it('opens a search result in its saved branch and clears its highlight',async()=>{
 let current={...fixtures(),active_branch_id:'main'};const requests:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(options?.method==='PATCH'){requests.push({path,body:JSON.parse(options.body)});current={...current,active_branch_id:'old'};return Response.json({chat:current})}
  return Response.json(path.includes('/status/')?{is_generating:false}:{chat:current});
 }));
 const store=await import('./store');await store.openSearchResult({chat_id:'c',title:'Chat',branch_id:'old',branch_name:'Old',message_id:'a',role:'assistant',snippet:'needle'},'needle');
 expect(requests).toEqual([{path:'/api/chats/c/branch',body:{branch_id:'old',expected_branch_id:'main'}}]);
 expect(store.currentChat()?.active_branch_id).toBe('old');expect(store.getState().searchTarget?.messageId).toBe('a');
 store.clearSearchTarget();expect(store.getState().searchTarget).toBeUndefined();
});
it('does not change a different chat after a delayed search result loads',async()=>{
 let release:((response:Response)=>void)|undefined;
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(options?.method==='PATCH')throw Error('Must not switch another chat');
  if(path.includes('/status/'))return Response.json({is_generating:false});
  if(path==='/api/chats/c')return new Promise<Response>(resolve=>{release=resolve});
  return Response.json({chat:{...fixtures(),id:'other',active_branch_id:'main'}});
 }));
 const store=await import('./store');const opening=store.openSearchResult({chat_id:'c',title:'Chat',branch_id:'old',branch_name:'Old',message_id:'a',role:'assistant',snippet:'needle'},'needle');
 await store.selectChat('other');release!(Response.json({chat:{...fixtures(),active_branch_id:'main'}}));await opening;
 expect(store.getState().active).toBe('other');expect(store.getState().searchTarget).toBeUndefined();
});

it.each(['google-subscription/gemini-3.8-flash','google-subscription/gemini-3.1-pro'])('sends image attachments to subscription model %s',async(model)=>{
 vi.stubGlobal('location',{origin:'http://localhost:8000'});
 const current={...fixtures(),model_id:model};const sent:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(path==='/api/chat/generate'){sent.push(JSON.parse(options.body));return Response.json({ok:true})}
  return Response.json(path.includes('/status/')?{is_generating:false}:{chat:current});
 }));
 const store=await import('./store');await store.selectChat('c');
 const attachments=[{name:'test.png',dataUrl:'data:image/png;base64,test'}];
 expect(await store.send('Describe',attachments)).toBe(true);
 expect(sent).toHaveLength(1);expect(sent[0].model).toBe(model);expect(sent[0].attachments).toEqual(attachments);
});

it('persists model memory independently without changing chat overrides',async()=>{
 let settings:any={model:'m',modelConfigs:{m:{temperature:.4},other:{memoryEnabled:true}}};
 window.storageManager.getSettings=()=>settings;
 window.storageManager.saveSettings=(patch:any)=>{settings={...settings,...patch}};
 window.storageManager.settingsWrite=Promise.resolve();
 window.storageManager.applyRemoteSettings=(patch:any)=>{for(const [model,values] of Object.entries(patch.model_configs))settings.modelConfigs[model]={...settings.modelConfigs[model],...values as any}};
 const request=vi.fn(async()=>Response.json({ok:true}));vi.stubGlobal('fetch',request);
 let store=await import('./store');
 const previous=store.overrides();
 await store.saveModelMemory('m',false);
 expect(settings.modelConfigs.m).toEqual({temperature:.4,memoryEnabled:false});
 expect(settings.modelConfigs.other.memoryEnabled).toBe(true);
 expect(store.overrides()).toEqual(previous);
 vi.resetModules();store=await import('./store');
 expect(store.getState().settings.modelConfigs.m.memoryEnabled).toBe(false);
 await store.saveModelMemory('m',true);
 expect(store.getState().settings.modelConfigs.m.memoryEnabled).toBe(true);
 request.mockRejectedValueOnce(new Error('offline'));
 await expect(store.saveModelMemory('m',false)).rejects.toThrow('offline');
 expect(store.getState().settings.modelConfigs.m.memoryEnabled).toBe(true);
});
