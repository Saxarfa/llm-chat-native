import {diagnostic} from './diagnostics';

/* Frame cadence of the main thread while a gesture or settle runs. It cannot
 * see compositor-only frames, but it shows when the page is too busy to follow
 * a finger. Only counts and milliseconds are reported; at most a few dozen
 * summaries per page session. */
const MAX_REPORTS=40,MAX_RUN_MS=3000;
let reports=0;

export type MotionProbe={stop:(state?:string)=>void};

export function summarizeFrames(stamps:number[]){
 const gaps=stamps.slice(1).map((value,index)=>value-stamps[index]).filter(gap=>gap>0);
 if(gaps.length<3)return null;
 const sorted=[...gaps].sort((a,b)=>a-b);
 const median=sorted[Math.floor(sorted.length/2)];
 return{
  count:stamps.length,
  median,
  p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],
  max:sorted[sorted.length-1],
  // A dropped frame: the gap is clearly longer than the device's normal cadence.
  jank:gaps.filter(gap=>gap>median*1.6&&gap>median+6).length
 };
}

export function startMotionProbe(source:string):MotionProbe{
 if(typeof requestAnimationFrame!=='function')return{stop:()=>{}};
 const stamps:number[]=[],begin=performance.now();
 let frame=0,done=false;
 const finish=(state:string)=>{
  if(done)return;done=true;cancelAnimationFrame(frame);
  const summary=summarizeFrames(stamps);
  if(!summary||reports>=MAX_REPORTS)return;
  reports++;
  diagnostic('client.lifecycle',{source:`motion_${source}`,state,duration_ms:performance.now()-begin,count:summary.count,
   frame_median_ms:summary.median,frame_p95_ms:summary.p95,frame_max_ms:summary.max,jank_count:summary.jank});
 };
 const tick=(now:number)=>{
  if(done)return;
  stamps.push(now);
  if(now-begin>MAX_RUN_MS){finish('timeout');return}
  frame=requestAnimationFrame(tick);
 };
 frame=requestAnimationFrame(tick);
 return{stop:(state='done')=>finish(state)};
}

/* Probe a fixed window after a state change the code does not follow frame by
 * frame, such as a sheet presenting or the studio stage collapsing. */
export function probeWindow(source:string,state:string,ms=450){
 if(typeof matchMedia==='function'&&!matchMedia('(max-width:800px)').matches)return;
 const probe=startMotionProbe(source);setTimeout(()=>probe.stop(state),ms);
}
