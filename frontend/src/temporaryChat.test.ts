import {afterEach,beforeEach,expect,it,vi} from 'vitest';

const privateChat=()=>({id:'temp_qa',temporary:true,title:'Временный чат',model_id:'m',messages:[],createdAt:1,updatedAt:1,overrides:{},active_branch_id:'main'});
beforeEach(()=>{
 vi.resetModules();vi.useFakeTimers();
 vi.stubGlobal('location',{origin:'http://localhost:8000'});
 vi.stubGlobal('sessionStorage',{getItem:()=>null,setItem:vi.fn(),removeItem:vi.fn()});
 vi.stubGlobal('window',{dispatchEvent:vi.fn(),storageManager:{getSettings:()=>({model:'m'}),getAuthHeaders:()=>({'Content-Type':'application/json'}),setActiveChatId:vi.fn(),applyRemoteChat:vi.fn(),removeChatLocally:vi.fn(),saveSettings:vi.fn()}});
});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals()});

it('keeps temporary messages, attachments and queued retries out of browser persistence',async()=>{
 let generating=false;
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>Response.json(path==='/api/temporary-chats'?{chat:privateChat()}:path.includes('/status/')?{chat:{...privateChat(),messages:[{id:'u',role:'user',content:'PRIVATE_SENT'}]},is_generating:generating,snapshot:{text:'PRIVATE_RESPONSE'}}:{ok:true})));
 const store=await import('./store');store.getState().user={id:1};
 await store.startTemporaryChat();store.currentChat()!.model_id='gemma-26b-qat';generating=true;
 await store.send('PRIVATE_SENT',[{name:'private.png',dataUrl:'PRIVATE_IMAGE'}]);
 await store.send('PRIVATE_QUEUED',[]);
 expect(store.currentChat()?.temporary).toBe(true);
 expect(store.getState().queues).toHaveLength(1);
 expect(window.storageManager.applyRemoteChat).not.toHaveBeenCalled();
 const persisted=JSON.stringify(vi.mocked(sessionStorage.setItem).mock.calls);
 expect(persisted).not.toMatch(/PRIVATE_|temp_qa/);
 expect(window.storageManager.setActiveChatId).not.toHaveBeenCalledWith('temp_qa');
 const requests=vi.mocked(fetch).mock.calls;
 const tokens=requests.map(([,options])=>(options?.headers as Record<string,string>)['X-Temporary-Session']);
 expect(new Set(tokens).size).toBe(1);expect(tokens[0].length).toBeGreaterThan(24);
});

it('leaving temporary mode clears chat, live output and queue without touching ordinary chats',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>Response.json(path==='/api/temporary-chats'?{chat:privateChat()}:{ok:true})));
 const store=await import('./store');store.getState().user={id:1};
 await store.startTemporaryChat();
 const saved={...privateChat(),id:'saved',temporary:false,title:'Saved'};store.getState().chats.push(saved);
 store.getState().lives.temp_qa={chat_id:'temp_qa',text:'PRIVATE_LIVE'};
 store.getState().queues.push({id:'q',chatId:'temp_qa',content:'PRIVATE_QUEUED',attachments:[],payload:{}});
 store.newChat();await store.endTemporaryChat();
 expect(store.getState().active).toBe('new');expect(store.getState().chats).toEqual([saved]);
 expect(store.getState().lives).toEqual({});expect(store.getState().queues).toEqual([]);
 expect(fetch).toHaveBeenCalledWith('/api/temporary-chats/temp_qa/close',expect.objectContaining({method:'POST'}));
});

it('temporary reasoning preferences do not write global model settings',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>Response.json(path==='/api/temporary-chats'?{chat:privateChat()}:path.includes('/status/')?{chat:privateChat(),is_generating:false}:{ok:true})));
 const store=await import('./store');await store.startTemporaryChat();
 await store.saveReasoning('m',{thinking:false});
 expect(window.storageManager.saveSettings).not.toHaveBeenCalled();
 expect(vi.mocked(fetch).mock.calls.map(call=>call[0])).toContain('/api/chats/temp_qa/overrides');
 expect(vi.mocked(fetch).mock.calls.map(call=>call[0])).not.toContain('/api/settings');
});

it('a late generation acknowledgement cannot resurrect a closed temporary chat',async()=>{
 let finish!:(r:Response)=>void;
 const pending=new Promise<Response>(resolve=>finish=resolve);
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>path==='/api/chat/generate'?pending:Response.json(path==='/api/temporary-chats'?{chat:privateChat()}:{ok:true})));
 const store=await import('./store');await store.startTemporaryChat();
 const sending=store.send('PRIVATE_PENDING',[]);store.newChat();
 finish(Response.json({ok:true}));await sending;
 expect(store.getState().active).toBe('new');expect(store.getState().chats).toEqual([]);
 expect(store.getState().lives).toEqual({});expect(store.getState().queues).toEqual([]);
});
