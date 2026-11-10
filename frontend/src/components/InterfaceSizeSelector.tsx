import {Check} from '../icons';
import {setInterfaceSize,useInterfaceSize} from '../interfaceSize';
import './InterfaceSizeSelector.css';

const choices=[{id:'compact',label:'Компактный'},{id:'normal',label:'Обычный'},{id:'large',label:'Крупный'}] as const;
export function InterfaceSizeSelector({compact=false}:{compact?:boolean}){
 const size=useInterfaceSize();
 if(compact)return <div className="settings-control-row" data-setting="Размер интерфейса"><span id="settings-size-label">Размер интерфейса<small>Масштаб меню и кнопок на этом устройстве.</small></span><div className="settings-segments" role="group" aria-labelledby="settings-size-label">{choices.map(({id,label})=><button key={id} type="button" aria-pressed={size===id} onClick={()=>setInterfaceSize(id)}>{label}</button>)}</div></div>;
 return <fieldset className="interface-size-selector" aria-describedby="interface-size-hint">
  <legend>Размер интерфейса</legend>
  <div className="interface-size-choices">{choices.map(({id,label})=><label key={id} className={`interface-size-choice ${size===id?'is-selected':''}`}>
   <input type="radio" name="interface-size" value={id} checked={size===id} onChange={()=>setInterfaceSize(id)}/>
   <span className={`interface-size-sample sample-${id}`} aria-hidden="true">Aa</span>
   <span>{label}</span><Check className="interface-size-check" size={14} aria-hidden="true"/>
  </label>)}</div>
  <p id="interface-size-hint">Размер меню и кнопок на этом устройстве. Размер текста ответов настраивается отдельно.</p>
 </fieldset>;
}
