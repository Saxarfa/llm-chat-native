import {Hint} from './Hint';
import {useSettingsScope} from './SettingsScope';
import {useRef,type ComponentProps,type ChangeEvent} from 'react';
import {Minus,Plus} from '../icons';
import './NumberInput.css';
export function NumberInput(props:ComponentProps<'input'>){
 const settings=useSettingsScope();
 const input=useRef<HTMLInputElement>(null);
 const step=(direction:number)=>{const node=input.current;if(!node||props.disabled)return;node.focus();try{if(direction>0)node.stepUp();else node.stepDown();props.onChange?.({target:node,currentTarget:node} as ChangeEvent<HTMLInputElement>)}catch{/* Invalid numeric constraints leave the editable value intact. */}};
 const label=String(props['aria-label']||'Значение');
 return <span className="number-input"><input {...props} ref={input} type="number"/><span className="number-input-actions"><Hint text={`Уменьшить: ${label}`}><button type="button" tabIndex={settings?0:-1} aria-label={`Уменьшить: ${label}`} disabled={props.disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>step(-1)}><Minus size={12}/></button></Hint><Hint text={`Увеличить: ${label}`}><button type="button" tabIndex={settings?0:-1} aria-label={`Увеличить: ${label}`} disabled={props.disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>step(1)}><Plus size={12}/></button></Hint></span></span>;
}
