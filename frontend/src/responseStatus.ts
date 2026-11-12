import {activityKind,type ActivityKind,type ActivityState} from './components/ActivityIndicator';
import {toolActivity} from './toolActivity';
import type {Live,Message} from './types';

export type ResponseStatus={kind:ActivityKind;state:ActivityState;label:string};
const running=(kind:ActivityKind,label:string):ResponseStatus=>({kind,state:'running',label});
const finishedPhases=new Set(['Поиск завершён','Источник прочитан','Источники прочитаны','База знаний проверена','Иллюстрация сохранена','Источники Google Search получены']);
const pendingImage=(status:string)=>['queued','preparing','generating'].includes(status);

/** One current operation; tool results stay in their own disclosure. */
export function responseStatus(message:Message,live?:Live):{current:ResponseStatus;phase:ResponseStatus|null;thinking:boolean}|null{
 if(!live)return null;
 if(live.stopping){const current=running('stopping','Сохраняем частичный ответ…');return {current,phase:current,thinking:false}}
 if(live.is_thinking)return {current:running('thinking','Думаю…'),phase:null,thinking:true};
 const events=message.tool_events||[],tool=events.findLast(event=>event.status==='running');
 if(tool){
  const summary=toolActivity(events),label=summary.kind==='image'?(tool.name==='edit_image'?'Изменение изображения':'Создание изображения'):summary.label;
  return {current:running(summary.kind,label),phase:null,thinking:false};
 }
 const image=message.generated_images?.findLast(image=>pendingImage(image.status));
 const incoming=live.phase==='Освобождение видеопамяти…'?'Подготовка запроса…':live.phase;
 const normalized=incoming?.replace(/[….]+$/u,'').trim();
 // These phases describe the preceding tool, not the request that is still running.
 // A failed tool can also be followed by a successful model response.
 const toolResult=!!events.length&&!!normalized&&(finishedPhases.has(normalized)||/^(Ошибка инструмента|Не удалось)|остановлен/iu.test(normalized));
 const label=toolResult?'Подготовка ответа…':incoming||(image?image.status==='queued'?'Подготовка изображения…':image.status==='preparing'?'Освобождение памяти LLM…':'Генерация изображения…':'Обработка запроса…');
 const state:ActivityState=toolResult?'running':/^(Ошибка|Не удалось)/iu.test(label)?'error':/остановлен/iu.test(label)?'cancelled':finishedPhases.has(normalized||'')?'completed':'running';
 const current:ResponseStatus={kind:toolResult?'processing':activityKind(label),state,label};
 if(message.content&&(!incoming||incoming==='Генерация ответа…'))return {current:running('processing','Генерация ответа…'),phase:null,thinking:false};
 return {current,phase:current,thinking:false};
}

export function responseOutcome(message:Message,stopping=false):{reason:'error'|'stopped'|'length'|'completed';label:string}{
 if(message.metrics?.error)return {reason:'error',label:'Не удалось завершить ответ'};
 if(message.metrics?.stopped||(message.metrics?.stopped==null&&stopping))return {reason:'stopped',label:'Ответ остановлен'};
 if(message.metrics?.finishReason==='length')return {reason:'length',label:'Достигнут лимит ответа'};
 // An image-only reply has no text/metrics error to describe its failed result.
 const image=message.generated_images?.at(-1);
 if(!message.content.trim()&&image?.status==='error')return {reason:'error',label:'Не удалось создать изображение'};
 if(!message.content.trim()&&image?.status==='cancelled')return {reason:'stopped',label:'Генерация изображения остановлена'};
 return {reason:'completed',label:'Ответ готов'};
}
