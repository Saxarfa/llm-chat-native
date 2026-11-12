// Schedule after completion so a slow server cannot build a queue of polls.
// Hidden tabs sleep; returning to the tab refreshes immediately.
export function pollVisible(refresh:()=>Promise<unknown>,delay:number){
 let stopped=false,running=false,rerun=false,timer:ReturnType<typeof setTimeout>|undefined;
 const run=async()=>{
  clearTimeout(timer);
  if(stopped||document.hidden)return;
  if(running){rerun=true;return}
  running=true;
  try{await refresh()}catch{/* Callers own their visible error state. */}
  finally{
   running=false;
   if(!stopped&&!document.hidden){timer=setTimeout(()=>void run(),rerun?0:delay);rerun=false}
  }
 };
 const visible=()=>{clearTimeout(timer);if(!document.hidden)void run()};
 document.addEventListener('visibilitychange',visible);void run();
 return()=>{stopped=true;clearTimeout(timer);document.removeEventListener('visibilitychange',visible)};
}
