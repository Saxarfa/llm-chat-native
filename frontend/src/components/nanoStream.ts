/** Authenticated SSE. Reconnects replay a snapshot, never a generation request. */
export async function readNanoStream(url:string,signal:AbortSignal,onEvent:(kind:string,data:unknown)=>void,onAlive:()=>void){
 const response=await fetch(url,{headers:window.storageManager.getAuthHeaders(),signal,cache:'no-store'});
 if(!response.ok||!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))throw Error('Stream unavailable');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
 try{for(;;){
  const {value,done}=await reader.read();if(done)throw Error('Stream closed');
  onAlive();buffer+=decoder.decode(value,{stream:true});
  let split;while((split=buffer.indexOf('\n\n'))>=0){
   const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);
   const lines=frame.split('\n'),kind=lines.find(line=>line.startsWith('event:'))?.slice(6).trim();
   const data=lines.filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
   if(kind&&data)onEvent(kind,JSON.parse(data));
  }
  if(buffer.length>8*1024*1024)throw Error('Stream frame too large');
 }}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
