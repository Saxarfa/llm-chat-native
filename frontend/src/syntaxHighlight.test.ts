import {afterEach,describe,expect,it,vi} from 'vitest';
import {SyntaxHighlighter,type HighlightRequest} from './syntaxHighlight';

function setup(){
 const workers:Array<ReturnType<typeof makeWorker>>=[];
 const makeWorker=()=>({
  onmessage:null as Worker['onmessage'],onerror:null as Worker['onerror'],onmessageerror:null as Worker['onmessageerror'],
  postMessage:vi.fn<(request:HighlightRequest)=>void>(),terminate:vi.fn(),
 });
 const failure=vi.fn(),client=new SyntaxHighlighter(()=>{const worker=makeWorker();workers.push(worker);return worker},failure);
 const respond=(worker=workers[0],html:string|null='coloured')=>{
  const request=worker.postMessage.mock.calls.at(-1)![0];
  worker.onmessage?.call(worker as unknown as Worker,{data:{id:request.id,chunks:html===null?null:[html]}} as MessageEvent);
 };
 return {client,workers,failure,respond};
}
afterEach(()=>{vi.useRealTimers()});
describe('shared syntax worker',()=>{
 it('coalesces many token updates into one latest queued snapshot per block',()=>{
  const {client,workers,respond}=setup(),owner={},receive=vi.fn();
  client.request(owner,'first','python',receive);
  for(let i=0;i<100;i++)client.request(owner,'latest-'+i,'python',receive);
  expect(workers).toHaveLength(1);expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
  respond();expect(receive).toHaveBeenCalledWith(['coloured']);
  expect(workers[0].postMessage).toHaveBeenCalledTimes(2);
  expect(workers[0].postMessage.mock.calls[1][0].code).toBe('latest-99');
  respond();expect(receive).toHaveBeenCalledTimes(2);client.dispose();
 });
 it('keeps independent blocks queued without an unmounted callback or stale response stealing the next result',()=>{
  const {client,workers,respond}=setup(),first={},second={},a=vi.fn(),b=vi.fn();
  client.request(first,'a','python',a);const stale=workers[0].postMessage.mock.calls[0][0].id;
  client.request(first,'new a','python',a);client.request(second,'b','javascript',b);client.cancel(first);
  respond();expect(a).not.toHaveBeenCalled();
  expect(workers[0].postMessage.mock.calls.at(-1)?.[0].code).toBe('b');
  workers[0].onmessage?.call(workers[0] as unknown as Worker,{data:{id:stale,chunks:['wrong']}} as MessageEvent);
  expect(b).not.toHaveBeenCalled();respond(workers[0],'right');expect(b).toHaveBeenCalledWith(['right']);client.dispose();
 });
 it('retries a failed worker once using the latest pending content, then stops retrying',()=>{
  const {client,workers,failure}=setup(),owner={},receive=vi.fn();
  client.request(owner,'a','python',receive);client.request(owner,'b','python',receive);
  workers[0].onerror?.call(workers[0] as unknown as Worker,{} as ErrorEvent);
  expect(workers[0].terminate).toHaveBeenCalledOnce();expect(workers).toHaveLength(2);
  expect(workers[1].postMessage.mock.calls[0][0].code).toBe('b');
  workers[1].onmessageerror?.call(workers[1] as unknown as Worker,{} as MessageEvent);
  client.request(owner,'c','python',receive);
  expect(workers).toHaveLength(2);expect(failure).toHaveBeenCalledOnce();expect(receive).not.toHaveBeenCalled();client.dispose();
 });
 it('bounds stalled work and cancels its timers on disposal',()=>{
  vi.useFakeTimers();const {client,workers}=setup();
  client.request({},'a','python',vi.fn());vi.advanceTimersByTime(15000);
  expect(workers).toHaveLength(2);client.dispose();vi.advanceTimersByTime(30000);
  expect(workers).toHaveLength(2);expect(workers[1].terminate).toHaveBeenCalledOnce();
 });
 it('continues the queue when a language is unsupported',()=>{
  const {client,workers,respond}=setup(),unknown=vi.fn(),known=vi.fn();
  client.request({},'a','unsupported',unknown);client.request({},'b','python',known);
  respond(workers[0],null);expect(unknown).not.toHaveBeenCalled();respond();expect(known).toHaveBeenCalledOnce();client.dispose();
 });
});
