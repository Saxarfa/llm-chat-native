import {HintButton} from './Hint';
import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {BookOpen,Languages,MessageCircle,ArrowUp,Loader2,Pause,Play,X} from '../icons';
import {selectedAnswer,selectedTextPrompt,selectionSourceLanguage,selectionTextLimit,selectionToolbarPosition,type AnswerSelection} from '../selectedText';
import {send,failure} from '../store';
import {readAloud} from '../readAloud';
import {ReadAloud} from './ReadAloud';
import {StateTransition} from './StateTransition';
import {Translator} from './Translator';
import {Button,Modal} from './primitives';
import {triggerHaptic} from '../haptics';
import './SelectionActions.css';

type ActionDialog={kind:'translate'|'clarify';selection:AnswerSelection};

export function SelectionActions({container,locked=false}:{container:RefObject<HTMLElement|null>;locked?:boolean}){
 const [selection,setSelection]=useState<AnswerSelection|null>(null),[visible,setVisible]=useState(false);
 const [touchMode,setTouchMode]=useState(()=>typeof window!=='undefined'&&!!window.matchMedia?.('(max-width: 800px) and (pointer: coarse)').matches);
 const [speechOpen,setSpeechOpen]=useState(false),[dialog,setDialog]=useState<ActionDialog|null>(null);
 const [question,setQuestion]=useState(''),[sending,setSending]=useState(false);
 const speech=useSyncExternalStore(readAloud.subscribe,readAloud.snapshot),speechOwner=useRef('');
 const [position,setPosition]=useState({left:12,top:12});
 const toolbar=useRef<HTMLDivElement>(null),current=useRef({speechOpen,dialog,visible}),alive=useRef(true);
 current.current={speechOpen,dialog,visible};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);

 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>,dragging=false;
  const dismiss=()=>{clearTimeout(timer);setVisible(false);setSpeechOpen(false)};
  const update=()=>{
   if(dragging||current.current.dialog||current.current.speechOpen)return;
   const root=container.current;if(!root)return;
   const next=selectedAnswer(window.getSelection(),root);
   if(next){
    if(!current.current.visible)triggerHaptic('selection');
    setSelection(next);setVisible(true);
   }else setVisible(false);
  };
  const schedule=()=>{
   if(document.activeElement?.matches('input,textarea,[contenteditable="true"]'))return;
   clearTimeout(timer);timer=setTimeout(update,140);
  };
  const insideControls=(target:EventTarget|null)=>target instanceof Element&&!!target.closest('.selection-actions,.selection-speech-mini,.tts-panel');
  const down=(event:PointerEvent)=>{
   if(event.pointerType==='touch')setTouchMode(true);
   else if(event.pointerType==='mouse')setTouchMode(!!window.matchMedia?.('(max-width: 800px) and (pointer: coarse)').matches);
   if(insideControls(event.target))return;
   dragging=true;dismiss();
  };
  const up=()=>{dragging=false;schedule()};
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){dismiss();return}
   if(!insideControls(event.target))schedule();
  };
  const scroll=(event:Event)=>{
   if(event.target instanceof Element&&event.target.closest('.tts-panel'))return;
   dismiss();
  };
  document.addEventListener('selectionchange',schedule);
  document.addEventListener('pointerdown',down);
  document.addEventListener('pointerup',up);
  document.addEventListener('pointercancel',up);
  document.addEventListener('keyup',key);
  container.current?.addEventListener('scroll',scroll,{passive:true});
  window.addEventListener('resize',dismiss);
  window.visualViewport?.addEventListener('resize',dismiss);
  window.visualViewport?.addEventListener('scroll',dismiss);
  const root=container.current;
  return()=>{
   clearTimeout(timer);document.removeEventListener('selectionchange',schedule);document.removeEventListener('pointerdown',down);
   document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);document.removeEventListener('keyup',key);
   root?.removeEventListener('scroll',scroll);window.removeEventListener('resize',dismiss);
   window.visualViewport?.removeEventListener('resize',dismiss);window.visualViewport?.removeEventListener('scroll',dismiss);
  };
 },[container]);

 useLayoutEffect(()=>{
  if(!visible||!selection||!toolbar.current)return;
  const viewport=window.visualViewport;
  setPosition(selectionToolbarPosition(selection.rect,toolbar.current.getBoundingClientRect(),{left:viewport?.offsetLeft||0,top:viewport?.offsetTop||0,width:viewport?.width||window.innerWidth,height:viewport?.height||window.innerHeight}));
 },[visible,selection]);

 const hide=()=>{setVisible(false);setSpeechOpen(false);window.getSelection()?.removeAllRanges()};
 const openDialog=(kind:ActionDialog['kind'])=>{if(!selection)return;triggerHaptic('light');setDialog({kind,selection});setQuestion('');hide()};
 const ask=async(picked:AnswerSelection,question?:string)=>{
  if(locked||sending||!picked.text.trim()||picked.text.length>selectionTextLimit)return;
  triggerHaptic('light');
  setSending(true);hide();
  try{
   window.dispatchEvent(new Event('suggestion-sent'));
   const accepted=await send(selectedTextPrompt(picked.text,question),[]);
   if(alive.current&&accepted)setDialog(null);
  }catch(error){if(alive.current)failure(error)}finally{if(alive.current)setSending(false)}
 };

 const tooLong=!!selection&&selection.text.length>selectionTextLimit;
 return <>
  {selection&&createPortal(<div ref={toolbar} className="selection-actions" role="group" aria-label="Действия с выделенным текстом" data-visible={visible} data-touch-dock={touchMode||undefined} style={touchMode?undefined:position} inert={!visible} aria-hidden={!visible}
   onPointerDown={event=>{if(event.pointerType==='mouse')event.preventDefault()}} onMouseDown={event=>event.preventDefault()}>
   <div className="selection-actions-row">
    <button type="button" disabled={locked||sending||tooLong} onClick={()=>void ask(selection)}><BookOpen size={14}/><span>Объяснить</span></button>
    <button type="button" disabled={tooLong} onClick={()=>openDialog('translate')}><Languages size={14}/><span>Перевести</span></button>
    <ReadAloud text={selection.text} disabled={selection.text.length>24000} label="Озвучить" showLabel open={speechOpen} onOpenChange={open=>{if(open)speechOwner.current=readAloud.snapshot().owner;setSpeechOpen(open)}}/>
    <button type="button" disabled={locked||sending||tooLong} onClick={()=>openDialog('clarify')}><MessageCircle size={14}/><span>Уточнить</span></button>
    {touchMode&&<HintButton type="button" className="selection-actions-dismiss" aria-label="Скрыть действия с текстом" onClick={hide}><X size={14}/></HintButton>}
   </div>
   {tooLong&&<small className="selection-actions-limit">Для перевода и вопросов выдели до 12 000 знаков</small>}
  </div>,document.body)}
  {!visible&&speech.owner===speechOwner.current&&['loading','playing','paused','ready'].includes(speech.phase)&&createPortal(<div className="selection-speech-mini" role="region" aria-label="Озвучка выделенного фрагмента">
   <span>{speech.phase==='loading'?'Готовлю озвучку…':'Озвучка фрагмента'}</span>
   {speech.phase!=='loading'&&<button type="button" aria-label={speech.phase==='playing'?'Приостановить фрагмент':'Продолжить фрагмент'} onClick={()=>void readAloud.toggle()}><StateTransition stateKey={speech.phase==='playing'?'pause':'play'} className="is-icon">{speech.phase==='playing'?<Pause size={14}/>:<Play size={14}/>}</StateTransition></button>}
   {speech.phase==='loading'&&<Loader2 size={14} className="spin" aria-hidden="true"/>}
   <HintButton type="button" aria-label="Остановить озвучку фрагмента" onClick={()=>readAloud.stop(speechOwner.current)}><X size={14}/></HintButton>
  </div>,document.body)}
  <Modal open={!!dialog} onClose={()=>setDialog(null)} title={dialog?.kind==='translate'?'Перевод фрагмента':'Уточнить фрагмент'} className={`selection-dialog ${dialog?.kind==='translate'?'selection-translation-dialog':''}`}>
   {dialog?.kind==='translate'?<Translator key={dialog.selection.text} compact initialText={dialog.selection.text} initialSource={selectionSourceLanguage(dialog.selection.text)} autoTranslate/>:dialog&&<form className="selection-question-form" onSubmit={event=>{event.preventDefault();if(question.trim())void ask(dialog.selection,question)}}>
    <blockquote>{dialog.selection.text}</blockquote>
    <label htmlFor="selection-question">Что хочешь уточнить?</label>
    <textarea id="selection-question" value={question} maxLength={4000} placeholder="Например, почему это так работает?" onChange={event=>setQuestion(event.target.value)} onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&question.trim()){event.preventDefault();void ask(dialog.selection,question)}}}/>
    <div className="selection-question-actions"><Button variant="ghost" type="button" onClick={()=>setDialog(null)}>Отмена</Button><Button type="submit" disabled={locked||sending||!question.trim()}>{sending?<Loader2 size={14} className="spin"/>:<ArrowUp size={16}/>}Спросить</Button></div>
   </form>}
  </Modal>
 </>;
}
