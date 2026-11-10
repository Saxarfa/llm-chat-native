import {useEffect,useRef,useState} from 'react';
import {diagnostic} from '../diagnostics';
import {observeComposerInputTiming} from '../composerInputTiming';
import {Button,Modal} from './primitives';
import './ComposerInputCheck.css';

/** Temporary opt-in comparison for a device-only input stall. The frame owns
 * ordinary browser fields, with no app styles, input handlers or form logic. */
export function ComposerInputCheck(){
 const [open,setOpen]=useState(false),cleanup=useRef<(()=>void)|undefined>(undefined);
 const dispose=()=>{cleanup.current?.();cleanup.current=undefined};
 useEffect(()=>dispose,[]);
 const loaded=(frame:HTMLIFrameElement)=>{
  dispose();const doc=frame.contentDocument;if(!doc)return;
  const removers:(()=>void)[]=[];
  for(const [id,source] of [['check-line','input-check-line'],['check-area','input-check-area']]){
   const field=doc.querySelector<HTMLInputElement|HTMLTextAreaElement>(`#${id}`);if(!field)continue;
   removers.push(observeComposerInputTiming(field,data=>diagnostic('client.lifecycle',data),source));
   const focus=()=>diagnostic('client.lifecycle',{state:'input_check_focus',source});
   field.addEventListener('focus',focus);removers.push(()=>field.removeEventListener('focus',focus));
  }
  cleanup.current=()=>removers.forEach(remove=>remove());
  diagnostic('client.lifecycle',{state:'input_check_loaded',source:'composer-check',count:removers.length/2});
 };
 const close=()=>{dispose();setOpen(false)};
 return <>
  <div className="composer-input-check-entry"><button type="button" onClick={()=>setOpen(true)}>Проверить задержку ввода</button></div>
  {open&&<Modal open onClose={close} title="Проверка ввода" description="Введи букву в каждом поле, удали весь текст и повтори." className="composer-input-check" persistent>
   <iframe title="Обычные поля ввода" src="/ui-assets/input-isolation.html" onLoad={event=>loaded(event.currentTarget)}/>
   <p className="input-check-note">Сравни задержку с капсулой чата. Тестовый текст не сохраняется и не отправляется.</p>
   <footer><Button variant="ghost" onClick={close}>Вернуться в чат</Button></footer>
  </Modal>}
 </>;
}
