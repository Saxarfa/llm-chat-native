import {useEffect,useRef} from 'react';

/** Decorative motion never updates React or the workspace camera. */
export function StudioCosmos(){
 const root=useRef<HTMLDivElement>(null),parallax=useRef<HTMLDivElement>(null),foreground=useRef<HTMLDivElement>(null),glow=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const layer=root.current,plane=parallax.current,near=foreground.current,light=glow.current,host=layer?.parentElement;
  if(!layer||!plane||!near||!light||!host)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)'),desktop=matchMedia('(min-width:801px) and (hover:hover) and (pointer:fine)');
  let frame=0,previous=0,x=0,y=0,targetX=0,targetY=0,inView=true,paused=true,bounds:DOMRect|null=null;
  const paint=()=>{
   plane.style.transform=`translate3d(${(-x*8).toFixed(2)}px,${(-y*6).toFixed(2)}px,0)`;
   near.style.transform=`translate3d(${(-x*20).toFixed(2)}px,${(-y*15).toFixed(2)}px,0)`;
   light.style.transform=`translate3d(${(x*(bounds?.width||0)*.42).toFixed(2)}px,${(y*(bounds?.height||0)*.42).toFixed(2)}px,0)`;
  };
  const tick=(now:number)=>{
   frame=0;if(paused)return;
   const dt=previous?Math.min(now-previous,50):16;previous=now;
   const blend=1-Math.exp(-dt/220);
   x+=(targetX-x)*blend;y+=(targetY-y)*blend;paint();
   if(Math.abs(targetX-x)+Math.abs(targetY-y)>.001)frame=requestAnimationFrame(tick);
   else{previous=0;x=targetX;y=targetY;paint()}
  };
  const schedule=()=>{if(!frame&&!paused)frame=requestAnimationFrame(tick)};
  const center=()=>{targetX=targetY=0;layer.dataset.tracking='false';schedule()};
  const measure=()=>{bounds=host.getBoundingClientRect()};
  const move=(event:PointerEvent)=>{
   if(paused||event.pointerType!=='mouse')return;
   if(event.buttons){center();return}
   if(!bounds)measure();if(!bounds||!bounds.width||!bounds.height)return;
   targetX=Math.max(-1,Math.min(1,(event.clientX-bounds.left)/bounds.width*2-1));
   targetY=Math.max(-1,Math.min(1,(event.clientY-bounds.top)/bounds.height*2-1));
   layer.dataset.tracking='true';
   schedule();
  };
  const reset=()=>{cancelAnimationFrame(frame);frame=previous=0;x=y=targetX=targetY=0;layer.dataset.tracking='false';paint()};
  const visibility=()=>{
   paused=document.documentElement.dataset.theme==='oled'||document.hidden||reduce.matches||!desktop.matches||!inView||!!host.closest('[hidden],[inert],[aria-hidden="true"]');
   layer.dataset.paused=String(paused);
   if(paused)reset();
  };
  const observer=new ResizeObserver(()=>{bounds=null});observer.observe(host);
  // Image and video workspaces stay mounted when their tab is hidden.
  // Suspend both CSS and pointer work immediately, including during page exits.
  const ancestors=new MutationObserver(visibility);
  ancestors.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  for(let parent:HTMLElement|null=host;parent;parent=parent.parentElement){
   if(parent===host||parent.matches('.generation-studio-pane,.page-surface'))ancestors.observe(parent,{attributes:true,attributeFilter:['hidden','inert','aria-hidden']});
  }
  const intersection=new IntersectionObserver(entries=>{inView=entries[0]?.isIntersecting??false;visibility()});intersection.observe(host);
  host.addEventListener('pointerenter',measure,{passive:true});
  host.addEventListener('pointermove',move,{passive:true});
  host.addEventListener('pointerleave',center,{passive:true});
  document.addEventListener('visibilitychange',visibility);
  reduce.addEventListener('change',visibility);desktop.addEventListener('change',visibility);
  visibility();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();ancestors.disconnect();intersection.disconnect();host.removeEventListener('pointerenter',measure);host.removeEventListener('pointermove',move);host.removeEventListener('pointerleave',center);document.removeEventListener('visibilitychange',visibility);reduce.removeEventListener('change',visibility);desktop.removeEventListener('change',visibility)};
 },[]);
 return <div ref={root} className="studio-cosmos" aria-hidden="true" data-paused="true"><div ref={parallax} className="studio-cosmos-parallax"><div className="studio-cosmos-nebula"/><div className="studio-cosmos-dust"/><div className="studio-cosmos-stars far"/></div><div ref={glow} className="studio-cosmos-glow"/><div ref={foreground} className="studio-cosmos-parallax foreground"><div className="studio-cosmos-stars near"/><div className="studio-cosmos-twinkle"/><div className="studio-cosmos-meteor"/></div></div>;
}
