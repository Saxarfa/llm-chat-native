import {diagnostic} from './diagnostics';

export type HighlightRequest={id:number;code:string;language:string};
export type HighlightResponse={id:number;chunks:string[]|null};
type Client=object;
type Work=HighlightRequest&{client:Client;receive:((chunks:string[])=>void)|null};
type HighlightWorker=Pick<Worker,'postMessage'|'terminate'|'onmessage'|'onerror'|'onmessageerror'>;

// One parser for the whole page. While it works, keep only the newest queued
// snapshot per code block; token arrival must never build an unbounded backlog.
export class SyntaxHighlighter{
 private worker:HighlightWorker|null=null;
 private pending=new Map<Client,Work>();
 private active:Work|null=null;
 private nextId=0;
 private failures=0;
 private timer:ReturnType<typeof setTimeout>|undefined;
 constructor(private create:()=>HighlightWorker,private failed:()=>void=()=>{}){}
 request(client:Client,code:string,language:string,receive:(chunks:string[])=>void){
  if(this.failures>=2)return;
  this.pending.set(client,{client,code,language,receive,id:++this.nextId});
  this.pump();
 }
 cancel(client:Client){
  this.pending.delete(client);
  if(this.active?.client===client)this.active.receive=null;
 }
 private pump(){
  if(this.active||!this.pending.size||this.failures>=2)return;
  try{
   if(!this.worker){
    const worker=this.worker=this.create();
    worker.onmessage=event=>{if(this.worker===worker)this.complete(event.data as HighlightResponse)};
    worker.onerror=()=>{if(this.worker===worker)this.fail()};
    worker.onmessageerror=()=>{if(this.worker===worker)this.fail()};
   }
   const next=this.pending.values().next().value!;
   this.pending.delete(next.client);this.active=next;
   this.timer=setTimeout(()=>this.fail(),15000);
   this.worker.postMessage({id:next.id,code:next.code,language:next.language} satisfies HighlightRequest);
  }catch{this.fail()}
 }
 private complete(result:HighlightResponse){
  const work=this.active;
  if(!work||result.id!==work.id)return;
  clearTimeout(this.timer);this.timer=undefined;this.active=null;this.failures=0;
  if(Array.isArray(result.chunks))work.receive?.(result.chunks);
  this.pump();
 }
 private fail(){
  clearTimeout(this.timer);this.timer=undefined;
  const work=this.active;this.active=null;
  this.worker?.terminate();this.worker=null;this.failures++;
  if(this.failures===1)this.failed();
  // Retry once, preferring a newer queued snapshot over the failed one.
  if(work?.receive&&!this.pending.has(work.client))this.pending.set(work.client,work);
  if(this.failures>=2)this.pending.clear();else this.pump();
 }
 dispose(){
  clearTimeout(this.timer);this.timer=undefined;this.pending.clear();this.active=null;
  this.worker?.terminate();this.worker=null;
 }
}

export const syntaxHighlighter=new SyntaxHighlighter(
 ()=>new Worker(new URL('./syntaxHighlight.worker.ts',import.meta.url),{type:'module'}),
 ()=>diagnostic('client.resource_error',{source:'syntax-worker',error_kind:'Error'}),
);
