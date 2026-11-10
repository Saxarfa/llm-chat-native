import {useState} from 'react';
import {ChevronDown,Languages} from '../icons';
import {Translator} from './Translator';
import './QuickTranslator.css';

export function QuickTranslator({standalone=false,onInsert}:{standalone?:boolean;onInsert?:(text:string,mode:'replace'|'append')=>void}){
 const [open,setOpen]=useState(false),[openedOnce,setOpenedOnce]=useState(false);
 const toggle=()=>{setOpen(value=>!value);setOpenedOnce(true)};
 if(standalone)return <section className="quick-translator-block quick-translator-standalone" aria-label="Быстрый перевод"><Translator compact languageNames onInsert={onInsert}/></section>;
 return <section className="quick-translator-block" aria-label="Быстрый перевод">
  <button type="button" className="quick-translator-toggle" aria-expanded={open} onClick={toggle}><Languages size={16}/><span>Быстрый перевод</span><ChevronDown size={14} className={open?'is-open':''}/></button>
  <div className="quick-translator-panel" data-open={open} aria-hidden={!open} inert={!open}><div className="quick-translator-panel-inner">{openedOnce&&<Translator compact/>}</div></div>
 </section>;
}
