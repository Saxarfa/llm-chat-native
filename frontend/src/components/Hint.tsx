import type {ComponentProps,ReactElement,ReactNode} from 'react';
import {Tooltip,TooltipContent,TooltipTrigger} from './ui/tooltip';

/** One tooltip surface for icon actions and short, useful explanations. */
export function Hint({text,children}:{text?:ReactNode;children:ReactElement}){
 if(!text)return children;
 return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent sideOffset={8}>{text}</TooltipContent></Tooltip>;
}
export function HintButton({hint,...props}:Omit<ComponentProps<'button'>,'title'>&{hint?:string}){
 const label=hint||props['aria-label'];
 return <Hint text={label}><button type="button" aria-label={label} {...props}/></Hint>;
}
export function HintLink({hint,...props}:Omit<ComponentProps<'a'>,'title'>&{hint?:string}){
 return <Hint text={hint}><a {...props}/></Hint>;
}
