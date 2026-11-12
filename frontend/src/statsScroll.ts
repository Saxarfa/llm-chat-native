type StatsResize={mode:'bottom'|'reveal'|'restore';top:number;max:number;gap:number;overflow:number;delta:number;remaining:number};
export function statsScrollPosition({mode,top,max,gap,overflow,delta,remaining}:StatsResize) {
 const restored=mode==='restore'?Math.min(remaining,Math.max(0,-delta)):0;
 const target=mode==='bottom'?max-gap:mode==='reveal'?top+Math.max(0,overflow):top-restored;
 return {top:Math.max(0,Math.min(max,target)),remaining:remaining-restored};
}
