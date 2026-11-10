import {useLayoutEffect,useRef,type ReactNode} from 'react';
import {AnimatePresence} from 'motion/react';
import {MessageEntrance} from './MessageEntrance';
import {StateTransition} from './StateTransition';
import {BookOpen,Brain,Cpu,Database,Globe,ImagePlus,Sparkles,Square,X} from '../icons';
export type ActivityKind='thinking'|'image'|'search'|'source'|'model'|'memory'|'processing'|'stopping';
export type ActivityState='running'|'completed'|'error'|'cancelled';
const icons={thinking:Brain,image:ImagePlus,search:Globe,source:BookOpen,model:Cpu,memory:Database,processing:Sparkles,stopping:Square};
export function activityKind(phase:string):ActivityKind{
 if(/рассужда|думает/i.test(phase))return 'thinking';
 if(/останов|сохран.*ответ/i.test(phase))return 'stopping';
 if(/памят|vram|выгруз/i.test(phase))return 'memory';
 if(/загруз.*модел/i.test(phase))return 'model';
 if(/изображ|картин|арт/i.test(phase))return 'image';
 if(/поиск/i.test(phase))return 'search';
 if(/источник|страниц/i.test(phase))return 'source';
 return 'processing';
}
export function ActivityGlyph({kind,state='running',paused=false}:{kind:ActivityKind;state?:ActivityState;paused?:boolean}){
 const Icon=icons[kind];
 // Only the tool timeline shows a glyph; the status line itself is text with a moving highlight.
 return <span className="activity-glyph" data-state={state} data-kind={kind} data-paused={paused||undefined} aria-hidden="true"><StateTransition stateKey={kind} className="is-icon"><Icon size={14}/></StateTransition>{state!=='running'&&state!=='completed'?<i className="activity-glyph-result">{state==='error'?<X size={6}/>:<Square size={5} fill="currentColor"/>}</i>:null}</span>;
}
export function ActivityIndicator({kind,state='running',label,identity,className='',meta,paused=false}:{kind:ActivityKind;state?:ActivityState;label:ReactNode;identity?:string;className?:string;meta?:ReactNode;paused?:boolean}){
 const mounted=useRef(false);useLayoutEffect(()=>{mounted.current=true},[]);
 // Meta that arrives after mount (the thinking time) fades in; restored history does not.
 const metaAtMount=useRef(!!meta);
 const key=identity||(typeof label==='string'?label:`${kind}:${state}`);
 return <span className={`activity-indicator ${className}`} data-state={state} data-kind={kind} data-paused={paused||undefined}><span className="activity-label"><AnimatePresence initial={false} mode="popLayout"><MessageEntrance key={key} className="activity-caption-text" enter={mounted.current} inline distance={3}>{label}</MessageEntrance></AnimatePresence></span>{meta&&<span className={metaAtMount.current?'activity-meta':'activity-meta activity-meta-in'}>{meta}</span>}</span>;
}
