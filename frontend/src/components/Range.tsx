import type {ComponentProps,CSSProperties} from 'react';

/** Keep the filled part in sync with both typing and pointer/keyboard changes. */
export function Range({value,min=0,max=100,className='',style,...props}:Omit<ComponentProps<'input'>,'type'>){
 const low=Number(min),high=Number(max),progress=high>low?Math.max(0,Math.min(100,(Number(value)-low)/(high-low)*100)):0;
 return <input {...props} type="range" className={`range ${className}`} min={min} max={max} value={value} style={{...style,'--range-progress':`${progress}%`} as CSSProperties}/>;
}
