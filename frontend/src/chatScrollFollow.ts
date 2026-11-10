// A Safari resize, rubber-band rebound or final layout change is not a request
// to follow the answer. On touch devices only a deliberate downward gesture
// can resume following once the reader has taken control.
export function resumeChatFollowing(following:boolean,mobile:boolean,distance:number,top:number,previous:number,downwardUntil:number,now:number){
 return distance<=2&&(following||top>previous+.01&&(!mobile||downwardUntil>now));
}

export function boundedScrollTop(top:number,height:number,viewport:number){
 return Math.max(0,Math.min(top,Math.max(0,height-viewport)));
}
