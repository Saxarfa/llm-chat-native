export type ImageRect={x:number;y:number;width:number;height:number};
export function fitArtRect(area:ImageRect,aspect:number):ImageRect {
 const width=Math.min(area.width,area.height*aspect),height=width/aspect;
 return {x:area.x+(area.width-width)/2,y:area.y+(area.height-height)/2,width,height};
}
export function artViewerTransform(source:ImageRect|null,destination:ImageRect,viewport:ImageRect) {
 // A source scrolled outside the screen should fade in place, not fly off-screen.
 if(!source||source.x+source.width<viewport.x||source.y+source.height<viewport.y||source.x>viewport.x+viewport.width||source.y>viewport.y+viewport.height)return {x:0,y:12,scaleX:.96,scaleY:.96};
 return {x:source.x+source.width/2-destination.x-destination.width/2,y:source.y+source.height/2-destination.y-destination.height/2,scaleX:source.width/destination.width,scaleY:source.height/destination.height};
}
