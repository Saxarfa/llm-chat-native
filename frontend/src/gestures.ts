export function isSidebarSwipe(dx:number,dy:number,elapsed:number,opening:boolean){
 const directed=opening?dx:-dx;
 return Math.abs(dx)>Math.abs(dy)*1.4&&(directed>=65||(directed>=35&&directed/Math.max(elapsed,1)>.45));
}

export function sidebarDragOffset(origin:number,dx:number,width:number){
 return Math.max(-width,Math.min(0,origin+dx));
}

/** A deliberate drag or a short flick; velocity is from the last few samples. */
export function shouldFinishSidebarDrag(offset:number,width:number,distance:number,velocity:number,opening:boolean){
 const progress=opening?(width+offset)/width:-offset/width;
 if(distance>=24&&Math.abs(velocity)>=.5)return velocity>0;
 return progress>=.3;
}

/** A downward header drag; short taps and stale flicks never dismiss a sheet. */
export function shouldDismissSheet(distance:number,height:number,velocity:number){
 return distance>=Math.min(120,Math.max(64,height*.22))||(distance>=28&&velocity>=.6);
}
