// One polite status region for short screen-reader notices ("Ответ готов").
// It never moves focus and never reads the streamed text itself.
let region:HTMLElement|null=null,timer=0;
export function announce(text:string){
 if(typeof document==='undefined')return;
 if(!region||!region.isConnected){
  region=document.createElement('div');
  region.className='sr-announcer';
  region.setAttribute('role','status');
  region.setAttribute('aria-atomic','true');
  document.body.append(region);
 }
 const target=region;
 // Clearing first makes a repeated identical notice audible again.
 target.textContent='';
 clearTimeout(timer);
 timer=window.setTimeout(()=>{target.textContent=text},60);
}
