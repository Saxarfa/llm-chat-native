export type StudioRect = {x:number;y:number;width:number;height:number};
export type ResizeSide = 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw';
export function resizeStudioRect(rect:StudioRect, side:ResizeSide, dx:number, dy:number, minHeight:number):StudioRect {
 const width=Math.max(280,Math.min(1800,rect.width+(side.includes('e')?dx:side.includes('w')?-dx:0)));
 const height=Math.max(minHeight,Math.min(1800,rect.height+(side.includes('s')?dy:side.includes('n')?-dy:0)));
 return {width,height,x:rect.x+(side.includes('w')?rect.width-width:0),y:rect.y+(side.includes('n')?rect.height-height:0)};
}
export function zoomStudioAt(view:{zoom:number;panX:number;panY:number}, zoom:number, x:number, y:number) {
 const next=Math.max(.1,Math.min(2,zoom));
 return {zoom:next,panX:x-(x-view.panX)/view.zoom*next,panY:y-(y-view.panY)/view.zoom*next};
}
