import {afterEach,expect,it,vi} from 'vitest';
import {readNanoStream} from './nanoStream';
afterEach(()=>vi.unstubAllGlobals());
it('decodes fragmented UTF-8 and multiple events without exposing partial JSON',async()=>{
 vi.stubGlobal('window',{storageManager:{getAuthHeaders:()=>({Authorization:'Bearer synthetic'})}});
 const body=new TextEncoder().encode(': keepalive\n\nevent: job\ndata: {"text":"Привет 🌱"}\n\nevent: snapshot\ndata: {"done":true}\n\n');
 const fetcher=vi.fn().mockResolvedValue(new Response(new ReadableStream({start(controller){for(let i=0;i<body.length;i+=3)controller.enqueue(body.slice(i,i+3));controller.close()}}),{headers:{'Content-Type':'text/event-stream'}}));
 vi.stubGlobal('fetch',fetcher);const events:unknown[]=[],alive=vi.fn();
 await expect(readNanoStream('/fixture',new AbortController().signal,(kind,data)=>events.push({kind,data}),alive)).rejects.toThrow('Stream closed');
 expect(events).toEqual([{kind:'job',data:{text:'Привет 🌱'}},{kind:'snapshot',data:{done:true}}]);
 expect(fetcher).toHaveBeenCalledTimes(1);expect(alive).toHaveBeenCalled();
 expect(fetcher.mock.calls[0][1].headers).toEqual({Authorization:'Bearer synthetic'});
});
it('rejects a non-stream response so the caller can use reconnection/fallback',async()=>{
 vi.stubGlobal('window',{storageManager:{getAuthHeaders:()=>({})}});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{headers:{'Content-Type':'application/json'}})));
 const receive=vi.fn();await expect(readNanoStream('/fixture',new AbortController().signal,receive,()=>{})).rejects.toThrow('Stream unavailable');expect(receive).not.toHaveBeenCalled();
});
