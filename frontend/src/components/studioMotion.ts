export const studioDefaults={width:320,formHeight:680,x:24,y:24,artX:368,artY:24,artWidth:600,artHeight:680,zoom:1,panX:0,panY:0,translatorX:992,translatorY:24,translatorWidth:360,translatorHeight:680};
export type StudioLayout=typeof studioDefaults;

// Older saved workspaces contain two windows. Preserve their geometry and place
// the new translator beside the art, then fit the camera once to reveal it.
export function restoreStudioLayout(value:unknown){
 if(!value||typeof value!=='object')return null;
 const saved=value as Record<string,unknown>,keys=Object.keys(studioDefaults) as (keyof StudioLayout)[];
 const finite=(key:keyof StudioLayout)=>typeof saved[key]==='number'&&Number.isFinite(saved[key]);
 if(!keys.filter(key=>!key.startsWith('translator')).every(finite))return null;
 const layout={...studioDefaults};
 for(const key of keys)if(finite(key))layout[key]=saved[key] as number;
 if(!finite('translatorX'))layout.translatorX=layout.artX+layout.artWidth+24;
 if(!finite('translatorY'))layout.translatorY=layout.artY;
 return {layout,complete:keys.every(finite)};
}

// Keep geometry on its owning elements: inherited workspace CSS variables
// invalidate every input, image and history card on each pointer movement.
export function studioStyles(v:StudioLayout){
 return {
  workspace:{transform:`translate(${v.panX}px, ${v.panY}px) scale(${v.zoom})`},
  form:{left:'0px',top:'0px',transform:`translate(${v.x}px, ${v.y}px)`,width:`${v.width}px`,height:`${v.formHeight}px`},
  art:{left:'0px',top:'0px',transform:`translate(${v.artX}px, ${v.artY}px)`,width:`${v.artWidth}px`,height:`${v.artHeight}px`},
  translator:{left:'0px',top:'0px',transform:`translate(${v.translatorX}px, ${v.translatorY}px)`,width:`${v.translatorWidth}px`,height:`${v.translatorHeight}px`},
 };
}
export function paintStudioLayout(v:StudioLayout,workspace:HTMLElement|null,form:HTMLElement|null,art:HTMLElement|null,zoom:HTMLElement|null,translator:HTMLElement|null=null){
 const styles=studioStyles(v);
 for(const [element,style] of [[workspace,styles.workspace],[form,styles.form],[art,styles.art],[translator,styles.translator]] as const){
  if(!element)continue;
  for(const [key,value] of Object.entries(style)){
   const name=key as 'transform'|'left'|'top'|'width'|'height';
   if(element.style[name]!==value)element.style[name]=value;
  }
 }
 const percent=`${Math.round(v.zoom*100)}%`;
 if(zoom&&zoom.textContent!==percent)zoom.textContent=percent;
}

// Pointer/wheel events only update the latest coordinates. Paint once per
// display frame, and publish to React/persistence when the interaction settles.
export class StudioMotion{
 private frame=0;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private committed:StudioLayout;
 constructor(public current:StudioLayout,private paint:(v:StudioLayout)=>void,private commit:(v:StudioLayout)=>void){this.committed=current}
 update(change:(v:StudioLayout)=>StudioLayout){
  const next=change(this.current);
  if((Object.keys(studioDefaults) as (keyof StudioLayout)[]).every(key=>next[key]===this.current[key]))return;
  this.current=next;
  if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.paint(this.current)});
  clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),180);
 }
 flush(){
  cancelAnimationFrame(this.frame);this.frame=0;clearTimeout(this.timer);
  this.paint(this.current);
  if(this.committed!==this.current){this.committed=this.current;this.commit(this.current)}
 }
 dispose(){cancelAnimationFrame(this.frame);clearTimeout(this.timer);this.frame=0}
}
