import {type ReactNode, type ComponentProps} from 'react';
import {Select as Primitive} from 'radix-ui';
import {Check, ChevronDown} from '../icons';
import './Select.css';

// Radix reserves an empty value for its placeholder; our forms also use it
// for a real option (personal memory, or an unselected model).
const emptyValue = '__app_select_empty__';
const encode = (value: string | number) => String(value) || emptyValue;
type Props = Omit<ComponentProps<typeof Primitive.Trigger>, 'value' | 'onChange' | 'children'> & {
 value: string | number;
 name?: string;
 required?: boolean;
 children: ReactNode;
 displayValue?: ReactNode;
 contentClassName?: string;
 onChange: (event: {target: {value: string}}) => void;
};

export function Select({value,onChange,children,displayValue,name,required,disabled,className='',contentClassName='',...props}: Props) {
 return <Primitive.Root value={encode(value)} onValueChange={next=>{if(next)onChange({target:{value:next===emptyValue?'':next}})}} name={name} required={required} disabled={disabled}>
  <Primitive.Trigger {...props} disabled={disabled} className={`app-select ${className}`}>
   <Primitive.Value>{displayValue}</Primitive.Value><Primitive.Icon className="app-select-chevron"><ChevronDown size={16}/></Primitive.Icon>
  </Primitive.Trigger>
  <Primitive.Portal><Primitive.Content className={`app-select-menu ${contentClassName}`} position="popper" sideOffset={5} collisionPadding={12}>
   <Primitive.Viewport className="app-select-viewport">{children}</Primitive.Viewport>
  </Primitive.Content></Primitive.Portal>
 </Primitive.Root>;
}

export function SelectOption({value,children,disabled,className=''}: {value?: string | number;children: ReactNode;disabled?: boolean;className?:string}) {
 return <Primitive.Item className={`app-select-option ${className}`} value={encode(value??String(children))} disabled={disabled}>
  <Primitive.ItemText>{children}</Primitive.ItemText><Primitive.ItemIndicator className="app-select-check"><Check size={14}/></Primitive.ItemIndicator>
 </Primitive.Item>;
}

export function SelectGroup({label,children}: {label: string;children: ReactNode}) {
 return <Primitive.Group className="app-select-group"><Primitive.Label className="app-select-group-label">{label}</Primitive.Label>{children}</Primitive.Group>;
}
