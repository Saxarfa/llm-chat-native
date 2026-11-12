import {useSyncExternalStore} from 'react';

let media:MediaQueryList|undefined;
const listeners=new Set<()=>void>();
const query=()=>{
 if(typeof window==='undefined'||typeof window.matchMedia!=='function')return undefined;
 return media??=window.matchMedia('(prefers-reduced-motion: reduce)');
};
const notify=()=>[...listeners].forEach(listener=>listener());
const subscribe=(listener:()=>void)=>{
 const preference=query();
 if(!listeners.size)preference?.addEventListener('change',notify);
 listeners.add(listener);
 return()=>{listeners.delete(listener);if(!listeners.size)preference?.removeEventListener('change',notify)};
};
const snapshot=()=>query()?.matches??false;
const serverSnapshot=()=>false;

/** One media listener for the whole UI, including changes made while it is open.
 * Motion's bundled hook snapshots only the initial preference; CSS alone cannot
 * stop React-driven height, opacity and Web Animations transitions.
 */
export function useReducedMotion(){return useSyncExternalStore(subscribe,snapshot,serverSnapshot)}
