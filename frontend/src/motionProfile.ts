import {solveSpringSettle,supportsLinearEasing} from './motionSpring';

// Device-wide choice between the spring-based gesture physics and the earlier
// fixed-duration easing. Kept local so it can be compared and rolled back on
// the phone itself.
const KEY='llm_motion_profile';
export type MotionProfile='fluid'|'classic';

export function motionProfile():MotionProfile{
 try{return localStorage.getItem(KEY)==='classic'?'classic':'fluid'}catch{return 'fluid'}
}

export function setMotionProfile(profile:MotionProfile){
 try{if(profile==='classic')localStorage.setItem(KEY,'classic');else localStorage.removeItem(KEY)}catch{/* Storage can be unavailable. */}
 applyMotionProfile();
}

/* Sheets present and dismiss along the same spring as the drawer. A spring that
 * starts from rest has one normalized curve, so it is sampled once for the
 * screen height and shared through CSS variables (surfaceMotion.css). */
export function applyMotionProfile(){
 const root=document.documentElement;
 // Reduced motion uses the plain profile: its fade-only surface rules must not be
 // overridden by the spring sheets, which travel the whole screen.
 const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 const fluid=motionProfile()==='fluid'&&supportsLinearEasing()&&!reduced;
 root.dataset.motion=fluid?'fluid':'classic';
 if(!fluid)return;
 const travel=Math.max(480,innerHeight||800);
 const enter=solveSpringSettle(travel,0,31),exit=solveSpringSettle(travel,0,46);
 root.style.setProperty('--sheet-in-duration',`${Math.round(enter.duration)}ms`);
 root.style.setProperty('--sheet-in-ease',enter.easing);
 root.style.setProperty('--sheet-out-duration',`${Math.round(exit.duration)}ms`);
 root.style.setProperty('--sheet-out-ease',exit.easing);
 // Desktop windows and menus rise a few pixels along the same kind of curve.
 const dialog=solveSpringSettle(14,0,26),menu=solveSpringSettle(8,0,32);
 root.style.setProperty('--pop-in-duration',`${Math.round(dialog.duration)}ms`);
 root.style.setProperty('--pop-in-ease',dialog.easing);
 root.style.setProperty('--menu-in-duration',`${Math.round(menu.duration)}ms`);
 root.style.setProperty('--menu-in-ease',menu.easing);
}

// The system setting can change while the page is open.
if(typeof matchMedia==='function')matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change',()=>applyMotionProfile());

/* A sheet's first frame also lays out its whole content. If the slide began in
 * that frame, a slow layout would first show it half way up. Hold it below the
 * screen through the first painted frame, then let the CSS transition run from
 * there. Returns a cleanup for a sheet closed before that. */
export function presentSheet(el:HTMLElement|null){
 if(!el||document.documentElement.dataset.motion!=='fluid'||!matchMedia('(max-width:800px)').matches||matchMedia('(prefers-reduced-motion: reduce)').matches)return()=>{};
 el.style.transition='none';el.style.translate='0 var(--surface-shift-y)';
 const release=()=>{el.style.removeProperty('transition');el.style.removeProperty('translate')};
 let frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(release)});
 return()=>{cancelAnimationFrame(frame);release()};
}
