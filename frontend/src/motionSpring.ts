/* Velocity-aware settling for gestures.
 *
 * A finger release hands its speed to a critically damped spring, so a flick
 * and a slow drag end differently and no frame jumps in speed. The curve is
 * sampled into a CSS linear() easing and played by WAAPI, which keeps the
 * movement on the compositor. Critically damped means no overshoot: surfaces
 * that sit against a screen edge never reveal what lies behind them.
 */

export type SpringSettle={duration:number;easing:string;progressAt:(ms:number)=>number};

const classicEasing='cubic-bezier(.23,1,.32,1)';
const STEP=1/480;

let linearSupport:boolean|undefined;
export function supportsLinearEasing(){
 if(linearSupport===undefined){
  try{linearSupport=typeof CSS!=='undefined'&&CSS.supports('animation-timing-function','linear(0,1)')}catch{linearSupport=false}
 }
 return linearSupport;
}

/** Solves x(t)=(1+(w-v)t)e^(-wt) for the remaining fraction x of the travel.
 * distance: px still to travel (>0). velocity: px/ms already moving toward the
 * target; opposing or invalid speed counts as rest. omega: stiffness in 1/s. */
export function solveSpringSettle(distance:number,velocity:number,omega:number,epsilonPx=.5,maxMs=900):SpringSettle{
 const travel=Math.max(1,Math.abs(distance)||1);
 const toward=Number.isFinite(velocity)&&velocity>0?velocity:0;
 const initial=toward*1000/travel;
 // Faster than the base spring: stiffen it, which keeps the curve monotonic.
 const w=Math.max(omega,initial),b=w-initial;
 const remaining=(t:number)=>(1+b*t)*Math.exp(-w*t);
 const epsilon=Math.min(.5,Math.max(.0005,epsilonPx/travel));
 let end=60/1000;
 // Sub-pixel travel needs no tail at all.
 while(Math.abs(distance)>epsilonPx&&end*1000<maxMs&&remaining(end)>epsilon)end+=STEP;
 const duration=Math.min(maxMs,Math.max(60,Math.round(end*1000)));
 const progressAt=(ms:number)=>ms>=duration?1:ms<=0?0:Math.min(1,1-remaining(ms/1000));
 return{duration,easing:springEasing(duration,progressAt),progressAt};
}

function springEasing(duration:number,progressAt:(ms:number)=>number){
 if(!supportsLinearEasing())return classicEasing;
 const count=Math.min(100,Math.max(12,Math.ceil(duration/6)));
 const points:string[]=['0'];
 for(let i=1;i<count;i++)points.push(progressAt(duration*i/count).toFixed(4));
 points.push('1');
 return `linear(${points.join(',')})`;
}
