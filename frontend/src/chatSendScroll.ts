/** One scroll owner for sending while the keyboard and composer change size.
 * Ease toward the live bottom rather than a stale absolute destination: the
 * live scroll range already contains the keyboard inset and dock clearance.
 */
export function animateChatSendScroll(area:HTMLElement,options:{from?:number|null;duration:number;reduced:boolean;interruptMomentum?:boolean;viewportChanging:()=>boolean;onProgress:(top:number)=>void;onComplete:()=>void}){
 // An explicit jump must take ownership from iOS's asynchronous scroll view.
 // Keep native panning disabled until this short animation finishes; App's
 // touchstart cancellation restores it before the next manual gesture moves.
 const properties=['overflow-y','scroll-behavior'] as const;
 const saved=options.interruptMomentum?properties.map(name=>({name,value:area.style.getPropertyValue(name),priority:area.style.getPropertyPriority(name)})):[];
 const restore=()=>{for(const {name,value,priority} of saved){if(value)area.style.setProperty(name,value,priority);else area.style.removeProperty(name)}};
 if(options.interruptMomentum){area.style.setProperty('overflow-y','hidden','important');area.style.setProperty('scroll-behavior','auto','important');void area.offsetHeight}
 const maximum=()=>Math.max(0,area.scrollHeight-area.clientHeight);
 const from=Math.max(0,Math.min(maximum(),options.from??area.scrollTop)),at=performance.now();
 let frame=0,cancelled=false,last=from;
 const place=(now:number)=>{
  const progress=options.reduced?1:Math.min(1,Math.max(0,(now-at)/options.duration));
  // Travel from the captured start toward the live bottom. A range change
  // (composer clearance, new rows, keyboard) moves the position only by its
  // share of the remaining easing, and the send never steps back up unless
  // the range itself ends above the current position.
  const bottom=maximum(),eased=from+(bottom-from)*(1-Math.pow(1-progress,3));
  area.scrollTo({top:Math.max(0,Math.min(bottom,Math.max(last,eased))),behavior:'instant'});
  last=area.scrollTop;options.onProgress(area.scrollTop);
  return progress;
 };
 // Keyboard samples and iframe height commits can arrive later in the same
 // paint than our rAF. Reconcile their layout before paint as well, so native
 // scroll-range clamping cannot complete the motion early and then rebound.
 const observer=new ResizeObserver(()=>{if(!cancelled)place(performance.now())});
 observer.observe(area);const column=area.querySelector('.message-column');if(column)observer.observe(column);
 const tick=(now:number)=>{
  if(cancelled)return;
  const progress=place(now);
  // Continue through keyboard dismissal even after the send motion completes.
  // A user's scroll/focus/navigation cancels this owner immediately.
  if(progress<1||options.viewportChanging())frame=requestAnimationFrame(tick);
  else{frame=0;observer.disconnect();restore();options.onComplete()}
 };
 // Without interpolation the final position is applied before the first paint.
 if(options.reduced)place(performance.now());
 frame=requestAnimationFrame(tick);
 return()=>{cancelled=true;cancelAnimationFrame(frame);frame=0;observer.disconnect();restore()};
}
