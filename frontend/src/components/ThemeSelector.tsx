import {Hint} from './Hint';
import {Check,Eclipse,Monitor,Moon,Sun} from '../icons';
import {setThemeMode,useThemeMode,type ThemeMode} from '../theme';
import './ThemeSelector.css';

const choices=[{id:'dark',label:'Тёмная',Icon:Moon},{id:'oled',label:'OLED',Icon:Eclipse},{id:'light',label:'Светлая',Icon:Sun},{id:'system',label:'Как в системе',Icon:Monitor}] as const;
export function ThemeSelector({compact=false}:{compact?:boolean}){
 const mode=useThemeMode();
 if(compact)return <div className="settings-control-row" data-setting="Тема интерфейса"><span id="settings-theme-label">Тема</span><div className="settings-segments settings-theme-segments" role="group" aria-labelledby="settings-theme-label">{[choices[3],choices[2],choices[0],choices[1]].map(({id,label,Icon})=><Hint key={id} text={`Выбрать тему: ${label}`}><button type="button" aria-label={`Выбрать тему: ${label}`} aria-pressed={mode===id} onClick={()=>setThemeMode(id)}><Icon size={18}/></button></Hint>)}</div></div>;
 return <fieldset className="theme-selector">
  <legend>Тема интерфейса</legend>
  <div className="theme-choices">{choices.map(({id,label,Icon})=><label className={`theme-choice ${mode===id?'is-selected':''}`} key={id}>
   <input type="radio" name="interface-theme" value={id} checked={mode===id} onChange={()=>setThemeMode(id as ThemeMode)}/>
   <span className={`theme-preview theme-preview-${id}`} aria-hidden="true"><span className="theme-preview-rail"><i/><i/><i/></span><span className="theme-preview-main"><i/><i/><span/></span>{mode===id&&<span className="theme-choice-check"><Check size={12}/></span>}</span>
   <span className="theme-choice-label"><Icon size={14}/>{label}</span>
  </label>)}</div>
  
 </fieldset>;
}
