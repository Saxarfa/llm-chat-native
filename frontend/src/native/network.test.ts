import {afterEach,it,expect,vi} from 'vitest';
vi.mock('@capacitor/preferences',()=>({Preferences:{get:async()=>({value:'http://fixture-pc:8000'})}}));
import {initializeNativeNetwork,normalizeServer,serverRequestURL} from './network';
afterEach(()=>vi.unstubAllGlobals());
it('validates server origins and prevents embedded credentials',()=>{
 expect(normalizeServer(' http://192.168.1.20:8000/ ')).toBe('http://192.168.1.20:8000');
 for(const value of ['file:///tmp','https://user:password@host','https://host/api','https://host/?token=secret'])expect(()=>normalizeServer(value)).toThrow();
});
it('routes only application API paths, preserving local and external assets',()=>{
 vi.stubGlobal('location',{href:'capacitor://localhost/index.html',protocol:'capacitor:',host:'localhost'});
 expect(serverRequestURL('/api/chats?x=1','http://pc')).toBe('http://pc/api/chats?x=1');
 for(const path of ['/ui-assets/chunk.js','/css/icons/icon.svg','https://example.com/api/test','blob:capacitor://localhost/1'])expect(serverRequestURL(path,'http://pc')).toBe(path);
});
it('preserves SSE streaming, abort signals, binary requests and auth isolation',async()=>{
 vi.stubGlobal('location',{href:'capacitor://localhost/index.html',protocol:'capacitor:',host:'localhost'});
 vi.stubGlobal('localStorage',{getItem:()=> 'fixture-token'});
 let streamController!:ReadableStreamDefaultController<Uint8Array>;
 const body=new ReadableStream<Uint8Array>({start(controller){streamController=controller;controller.enqueue(new TextEncoder().encode('data: first\n\n'))}});
 const original=vi.fn(async()=>new Response('public')).mockImplementationOnce(async()=>new Response(body));vi.stubGlobal('window',{fetch:original});
 await initializeNativeNetwork();const abort=new AbortController();const payload=new Blob(['binary']);
 const response=await window.fetch('/api/chat/generate',{method:'POST',body:payload,signal:abort.signal});
 const [url,options]=original.mock.calls[0] as unknown as [string,RequestInit];
 expect(url).toBe('http://fixture-pc:8000/api/chat/generate');expect(options.body).toBe(payload);expect(options.signal).toBe(abort.signal);
 expect(new Headers(options.headers).get('Authorization')).toBe('Bearer fixture-token');expect(options.credentials).toBe('omit');
 const reader=response.body!.getReader();expect(new TextDecoder().decode((await reader.read()).value)).toContain('first');streamController.close();
 await window.fetch('https://example.com/api/public');expect(original.mock.calls[1]).toEqual(['https://example.com/api/public',undefined]);
});
