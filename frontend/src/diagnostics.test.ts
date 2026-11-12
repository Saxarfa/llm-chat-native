import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {BrowserDiagnostics,clientError,clientWindowError,diagnosticRoute} from './diagnostics';
let agent:BrowserDiagnostics;
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('location',{origin:'http://localhost:8000',href:'http://localhost:8000/'});});
afterEach(()=>{agent?.close();vi.useRealTimers();vi.unstubAllGlobals()});

it('links requests without reading their bodies or exposing credentials and private errors',async()=>{
 const original=vi.fn(async()=>new Response('private response',{status:502}));
 agent=new BrowserDiagnostics(original,()=> '1',()=>({Authorization:'Bearer private-token'}));
 const body=JSON.stringify({message:'private prompt',password:'secret'});
 const response=await agent.fetch('/api/chats/private-chat?token=secret',{method:'POST',headers:{Authorization:'Bearer key'},body});
 expect(await response.text()).toBe('private response');
 const request=original.mock.calls[0] as unknown as [string,RequestInit];
 expect(new Headers(request[1].headers).get('X-Request-ID')).toMatch(/^[a-f0-9]{32}$/);
 expect(request[1].body).toBe(body);
 await agent.flush();
 const batch=(original.mock.calls[1] as unknown as [string,RequestInit])[1].body as string;
 expect(batch).not.toMatch(/private|secret|Bearer|prompt|password/);
 expect(JSON.parse(batch).events[0]).toMatchObject({route:'/api/chats/:id',status:502,trace_id:new Headers(request[1].headers).get('X-Request-ID')});
});

it('never sends old account diagnostics under new credentials',async()=>{
 let owner='1';let finish!:(r:Response)=>void;
 const original=vi.fn((path:RequestInfo|URL,_options?:RequestInit)=>path==='/api/diagnostics/events'?Promise.resolve(Response.json({ok:true})):new Promise<Response>(r=>finish=r));
 agent=new BrowserDiagnostics(original,()=>owner,()=>({}));
 agent.note('client.error',{error_kind:'TypeError'});
 const old=agent.fetch('/api/chat/generate',{method:'POST'});
 owner='2';finish(Response.json({}, {status:502}));await old;await agent.flush();
 expect(original).toHaveBeenCalledTimes(1);
 agent.note('client.lifecycle',{state:'visible'});await agent.flush();
 const batch=JSON.parse((original.mock.calls[1][1] as RequestInit).body as string);
 expect(batch.events.map((event:any)=>event.event)).toEqual(['client.lifecycle']);
});

it('keeps the queue bounded during outages and retries through the original fetch without recursion',async()=>{
 const original=vi.fn().mockRejectedValueOnce(new TypeError('secret')).mockResolvedValue(Response.json({ok:true}));
 agent=new BrowserDiagnostics(original,()=> '1',()=>({}));
 for(let i=0;i<1000;i++)agent.note('client.error',{error_kind:'TypeError',message:'secret',password:'secret'});
 await agent.flush();await agent.flush();
 const batch=JSON.parse(original.mock.calls[1][1].body);
 expect(batch.events.length).toBeLessThanOrEqual(20);
 expect(batch.events.some((event:any)=>event.event==='client.dropped')).toBe(true);
 expect(JSON.stringify(batch)).not.toContain('secret');
});

it('does not trace external requests, static assets, unauthenticated errors or the diagnostics upload itself',async()=>{
 const original=vi.fn().mockResolvedValue(Response.json({}, {status:502}));
 agent=new BrowserDiagnostics(original,()=>undefined,()=>({}));
 for(const path of ['https://external.example/api/chat','/ui-assets/main.js','/api/diagnostics/events','/api/auth/login'])await agent.fetch(path);
 await agent.flush();expect(original).toHaveBeenCalledTimes(4);
 expect(original.mock.calls[0][1]).toBeUndefined();
 expect(original.mock.calls[1][1]).toBeUndefined();
 expect(original.mock.calls[2][1]).toBeUndefined();
});

it('preserves Request headers and streams without consuming responses',async()=>{
 const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('data: ok\n\n'));controller.close()}});
 const response=new Response(stream),original=vi.fn().mockResolvedValue(response);
 agent=new BrowserDiagnostics(original,()=> '1',()=>({}));
 const result=await agent.fetch(new Request('http://localhost:8000/api/sync/events',{headers:{Authorization:'Bearer secret'}}));
 expect(result).toBe(response);expect(result.bodyUsed).toBe(false);
 expect(new Headers(original.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer secret');
 await agent.flush();expect(original).toHaveBeenCalledTimes(1);
});

it('keeps useful stack positions without messages or URL secrets',()=>{
 const error={name:'TypeError',stack:'TypeError: private message\n at call (https://secret.example/private/ui-assets/index-Abc.js:45:12)'};
 expect(clientError(error)).toEqual({error_kind:'TypeError',error_code:'unknown',frames:[{file:'index-Abc.js',line:45,column:12}]});
 expect(diagnosticRoute('/api/chat/status/private-id?token=secret')).toBe('/api/chat/status/:id');
});

it('identifies browser resize loops without recording their message or private exception text',()=>{
 for(const message of ['ResizeObserver loop completed with undelivered notifications.','ResizeObserver loop limit exceeded']){
  expect(clientWindowError({error:null,message})).toEqual({error_kind:'Error',error_code:'resize_observer_loop',frames:[]});
 }
 const fields=clientWindowError({error:new Error('private text'),message:'ResizeObserver private prompt'});
 expect(fields.error_code).toBe('unknown');
 expect(JSON.stringify(fields)).not.toMatch(/private|prompt|message/);
});

it('works on HTTP LAN browsers without randomUUID',async()=>{
 vi.stubGlobal('crypto',{getRandomValues:(bytes:Uint8Array)=>bytes.fill(5)});
 const original=vi.fn().mockResolvedValue(Response.json({ok:true}));
 agent=new BrowserDiagnostics(original,()=> '1',()=>({}));
 await agent.fetch('/api/chat/generate',{method:'POST'});
 expect(new Headers(original.mock.calls[0][1].headers).get('X-Request-ID')).toMatch(/^[a-f0-9]{32}$/);
});
