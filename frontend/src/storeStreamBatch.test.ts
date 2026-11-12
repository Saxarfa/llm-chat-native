import {afterEach,beforeEach,expect,it,vi} from 'vitest';

const chat=(content='')=>({id:'c',title:'Chat',model_id:'m',active_branch_id:'main',messages:[{id:'u',role:'user' as const,content:'Question',timestamp:1},...(content?[{id:'a',role:'assistant' as const,content,timestamp:2}]:[])],createdAt:1,updatedAt:1,overrides:{}});
let notify:()=>void;
const frames=new Map<number,FrameRequestCallback>();
beforeEach(()=>{
 vi.resetModules();vi.useFakeTimers();frames.clear();let nextFrame=0;
 vi.doMock('react',()=>({useRef:()=>({current:undefined}),useSyncExternalStore:(subscribe:(fn:()=>void)=>void,snapshot:()=>unknown)=>{subscribe(()=>notify());return snapshot()}}));
 vi.stubGlobal('location',{origin:'http://localhost:8000'});
 vi.stubGlobal('sessionStorage',{getItem:()=>null,setItem:vi.fn(),removeItem:vi.fn()});
 vi.stubGlobal('document',{hidden:false,addEventListener:vi.fn()});
 vi.stubGlobal('requestAnimationFrame',vi.fn((callback:FrameRequestCallback)=>{const id=++nextFrame;frames.set(id,callback);return id}));
 vi.stubGlobal('cancelAnimationFrame',vi.fn((id:number)=>frames.delete(id)));
 vi.stubGlobal('setInterval',vi.fn(()=>1));
 vi.stubGlobal('window',{dispatchEvent:vi.fn(),addEventListener:vi.fn(),storageManager:{
  currentUser:{id:1},accountKey:(key:string)=>key+'-1',getSettings:()=>({model:'m'}),getAuthHeaders:()=>({'Content-Type':'application/json'}),
  checkAuth:async()=>({ok:true,user:{id:1}}),getChats:()=>[chat()],setActiveChatId:vi.fn(),
  saveChatsLocally:vi.fn(),applyRemoteChat:vi.fn(),refreshSettingsFromServer:async()=>true,
  clearAuthSession:vi.fn(),settingsWrite:Promise.resolve(),logout:async()=>{},
 }});
});
afterEach(()=>{vi.doUnmock('react');vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals()});

async function fixture(){
 let controller!:ReadableStreamDefaultController<Uint8Array>;
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:any)=>{
  if(path==='/api/sync/events')return new Response(new ReadableStream({start(stream){controller=stream;options.signal.addEventListener('abort',()=>stream.error(new DOMException('Aborted','AbortError')))}}));
  if(path==='/api/chats/c')return Response.json({chat:chat()});
  return Response.json({ok:true,models:[],raw:{data:[]}});
 }));
 const store=await import('./store');await store.init();
 const seen:ReturnType<typeof store.getState>[]=[];notify=()=>seen.push(store.getState());store.useChat();
 const events=async(values:Record<string,unknown>[])=>{
  controller.enqueue(new TextEncoder().encode(values.map(value=>'data: '+JSON.stringify({chat_id:'c',user_id:1,...value})+'\n\n').join('')));
  for(let i=0;i<100;i++)await Promise.resolve();
 };
 await events([{type:'stream_start',model:'m'}]);seen.length=0;
 return {store,seen,events};
}

it('coalesces a burst while immediately retaining every text, tool, image and phase update',async()=>{
 const {store,seen,events}=await fixture();
 const values=Array.from({length:120},(_,i)=>({type:'stream_chunk',text:'Answer '+i,reasoning:'Thought '+i}));
 values.splice(30,0,{type:'stream_tool',tool_events:[{id:'tool',name:'generate_image',status:'running'}]} as any);
 values.splice(70,0,{type:'stream_image',generated_images:[{id:'image',status:'generating',progress:65}]} as any);
 values.splice(80,0,{type:'stream_phase',web_images:[{id:'web',chat_id:'c',caption:'Diagram',width:140,height:70}]} as any);
 values.push({type:'stream_phase',phase:'Sampling'} as any);
 await events(values);
 expect(store.getState().lives.c).toMatchObject({text:'Answer 119',reasoning:'Thought 119',phase:'Sampling',tool_events:[{id:'tool'}],generated_images:[{id:'image',progress:65}]});
 expect(store.getState().lives.c.web_images).toMatchObject([{id:'web',chat_id:'c',caption:'Diagram',width:140,height:70}]);
 expect(seen).toHaveLength(0);expect(frames.size).toBe(1);
 [...frames.values()][0](16);
 expect(seen).toHaveLength(1);expect(frames.size).toBe(0);
 await vi.advanceTimersByTimeAsync(45);expect(seen).toHaveLength(1);
 await store.logout();
});

it('delivers completion synchronously and cancels the pending partial frame',async()=>{
 const {store,seen,events}=await fixture();
 await events([{type:'stream_chunk',text:'Partial'},{type:'stream_end',chat:chat('Final answer'),final_message:{content:'Final answer'}}]);
 expect(seen).toHaveLength(1);expect(frames.size).toBe(0);
 expect(seen[0].lives.c).toBeUndefined();expect(seen[0].chats[0].messages.at(-1)?.content).toBe('Final answer');
 await vi.advanceTimersByTimeAsync(45);expect(seen).toHaveLength(1);
 await store.logout();
});

it('cancels pending stream publication on logout without publishing the old account again',async()=>{
 const {store,seen,events}=await fixture();await events([{type:'stream_chunk',text:'Private answer'}]);
 expect(frames.size).toBe(1);await store.logout();
 const count=seen.length;
 expect(frames.size).toBe(0);expect(store.getState().user).toBeNull();expect(store.getState().lives).toEqual({});
 await vi.advanceTimersByTimeAsync(45);expect(seen).toHaveLength(count);
 expect(seen.every(snapshot=>snapshot.user===null)).toBe(true);
});

it('bounds delivery when requestAnimationFrame is unavailable or suspended',async()=>{
 const {store,seen,events}=await fixture();vi.stubGlobal('requestAnimationFrame',undefined);
 await events([{type:'stream_chunk',text:'Current answer'}]);
 await vi.advanceTimersByTimeAsync(39);expect(seen).toHaveLength(0);
 await vi.advanceTimersByTimeAsync(1);expect(seen).toHaveLength(1);expect(seen[0].lives.c.text).toBe('Current answer');
 await store.logout();
});

it('uses the timer fallback and cancels a frame that never fires',async()=>{
 const {store,seen,events}=await fixture();await events([{type:'stream_chunk',text:'Latest answer'}]);
 expect(frames.size).toBe(1);
 await vi.advanceTimersByTimeAsync(40);
 expect(seen).toHaveLength(1);expect(frames.size).toBe(0);
 expect(seen[0].lives.c.text).toBe('Latest answer');
 await store.logout();
});

it('closing a temporary chat immediately removes its pending stream update',async()=>{
 const {store,seen,events}=await fixture();
 store.getState().chats.push({...chat(),id:'temp_c',temporary:true});
 await events([{chat_id:'temp_c',type:'stream_chunk',text:'Temporary answer'}]);
 expect(frames.size).toBe(1);await store.endTemporaryChat(false);
 expect(store.getState().lives.temp_c).toBeUndefined();expect(store.getState().chats.some(chat=>chat.id==='temp_c')).toBe(false);
 expect(frames.size).toBe(0);const count=seen.length;
 await vi.advanceTimersByTimeAsync(45);expect(seen).toHaveLength(count);
 await store.logout();
});

it('user actions publish immediately and cancel the pending stream notification',async()=>{
 const {store,seen,events}=await fixture();await events([{type:'stream_chunk',text:'Current answer'}]);
 store.notify('Action complete');
 expect(seen).toHaveLength(1);expect(seen[0].toast).toBe('Action complete');expect(seen[0].lives.c.text).toBe('Current answer');
 expect(frames.size).toBe(0);await vi.advanceTimersByTimeAsync(45);expect(seen).toHaveLength(1);
 await store.logout();
});
