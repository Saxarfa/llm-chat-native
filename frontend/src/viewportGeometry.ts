export interface ViewportLayout {
 height:number;
 width:number;
 frozen:boolean;
}

export interface ViewportSample {
 /** Current visual viewport height, excluding the keyboard. */
 height:number;
 width:number;
 /** Browser layout viewport height, used when the device rotates. */
 layoutHeight:number;
 focused:boolean;
 settled:boolean;
}

/** Keep the page layout stable until the keyboard has finished closing. */
export function viewportLayout(previous:ViewportLayout,sample:ViewportSample):ViewportLayout {
 const orientationChanged=Math.abs(sample.width-previous.width)>50;
 if(orientationChanged){
  return {height:Math.max(sample.layoutHeight,sample.height),width:sample.width,frozen:sample.focused||previous.frozen};
 }
 const closing=previous.frozen&&!sample.focused;
 const canRelease=closing&&sample.settled&&previous.height-sample.height<100;
 const frozen=sample.focused||(previous.frozen&&!canRelease);
 return {height:frozen?Math.max(previous.height,sample.height):sample.height,width:sample.width,frozen};
}

/** One keyboard inset; Safari's pan offset is a separate, bounded translation. */
export function viewportFrame(visibleHeight:number,offsetTop:number,layoutHeight:number){
 const height=Math.max(layoutHeight,visibleHeight),inset=height-visibleHeight;
 return {height,top:inset<1?0:Math.min(inset,Math.max(0,offsetTop)),visibleHeight,inset};
}
