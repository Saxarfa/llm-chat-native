import {useEffect,useId,useRef,useState} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {ArrowUpRight,Check,ChevronDown,MessageCircle} from '../icons';
import {sendSuggestion,failure} from '../store';
import './ChatSuggestions.css';

const mobileQuery='(max-width:800px)';
const easing=[.23, 1, .32, 1] as const;

function SuggestionButton({text,sending,selected,reduced,onChoose}:{text:string;sending:boolean;selected:boolean;reduced:boolean|null;onChoose:(text:string)=>void}){
 return <motion.button type="button" className="chat-suggestion" disabled={sending} data-selected={selected} aria-label={text} onClick={()=>onChoose(text)}
  initial={false} animate={{opacity:sending&&!selected?.35:1}} transition={{duration:reduced?0:.16}}>
  <span className="chat-suggestion-text">{text}</span>
  <span className="chat-suggestion-arrow" aria-hidden="true">
   <AnimatePresence initial={false} mode="wait"><motion.span key={selected?'selected':'arrow'} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:.1}}>{selected?<Check size={14}/>:<ArrowUpRight size={14}/>}</motion.span></AnimatePresence>
  </span>
 </motion.button>;
}

export function ChatSuggestions({messageId,items,visible}:{messageId:string;items?:string[];visible:boolean}){
 const reduced=useReducedMotion(),[mobile,setMobile]=useState(()=>typeof window!=='undefined'&&window.matchMedia(mobileQuery).matches);
 const [sending,setSending]=useState(false),[selected,setSelected]=useState<string|null>(null),[expanded,setExpanded]=useState(false),optionsId=useId();
 const choosing=useRef(false),alive=useRef(true);
 useEffect(()=>{const media=window.matchMedia(mobileQuery),change=()=>setMobile(media.matches);change();media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{choosing.current=false;setSending(false);setSelected(null);setExpanded(false)},[messageId,items?.join('|')]);
 const choose=async(text:string)=>{
  if(choosing.current)return;choosing.current=true;setSending(true);setSelected(text);let accepted=false;
  try{accepted=await sendSuggestion(messageId,text)}
  catch(e){if(alive.current)failure(e)}
  finally{if(alive.current&&!accepted){choosing.current=false;setSending(false);setSelected(null)}}
 };
 const shown=mobile&&!expanded?items?.slice(0,2):items;
 return <AnimatePresence initial={false}>{visible&&!!items?.length&&
  <motion.div key={messageId+items.join('|')} className="chat-suggestions-presence"
   initial={{opacity:0}} animate={{opacity:1}}
   transition={{duration:reduced?0:.15}}>
   <div className="chat-suggestions" role="group" aria-label="Продолжить разговор" data-expanded={expanded} aria-busy={sending}>
    <div className="chat-suggestions-caption"><MessageCircle size={14} aria-hidden="true"/><span>Продолжить разговор</span></div>
    <div className="chat-suggestions-options" id={optionsId}>
     <AnimatePresence initial={false}>
      {shown?.map(text=><motion.div key={text} className="chat-suggestion-slot"
       initial={mobile?{height:0,opacity:0}:false} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
       transition={{height:{duration:reduced?0:.22,ease:easing},opacity:{duration:reduced?0:.16}}}>
       <div className="chat-suggestion-slot-inner"><SuggestionButton text={text} sending={sending} selected={selected===text} reduced={reduced} onChoose={text=>void choose(text)}/></div>
      </motion.div>)}
     </AnimatePresence>
    </div>
    {mobile&&items.length>2&&<button type="button" className="chat-suggestions-expand" aria-expanded={expanded} aria-controls={optionsId} disabled={sending} onClick={()=>setExpanded(value=>!value)}>{expanded?'Свернуть':'Ещё варианты'}<ChevronDown size={12} aria-hidden="true"/></button>}
   </div>
  </motion.div>
 }</AnimatePresence>;
}
