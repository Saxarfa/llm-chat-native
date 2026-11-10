import {useEffect,useState} from 'react';
import {ActivityIndicator,type ActivityKind} from './ActivityIndicator';
import type {StudioJob} from './studioTypes';
export function nanoPhaseLabel(job:StudioJob,video=false){
 switch(job.phase){
  case 'queued':return 'Ожидаю своей очереди';
  case 'preparing':return 'Подготавливаю запрос';
  case 'count_tokens':return 'Проверяю контекст';
  case 'thinking':return 'AI Studio: рассуждение';
  case 'responding':return 'AI Studio: получаю текст';
  case 'image_received':return 'Изображение получено';
  case 'video_received':return 'Видео получено';
  case 'saving':return 'Сохраняю результат';
  default:return job.status==='queued'?'В очереди':job.status==='preparing'?'Подготавливаю запрос':video?'Ожидаю видео от AI Studio':'Ожидаю ответ AI Studio';
 }
}
export function nanoPhaseDetail(job:StudioJob,now=Date.now()){
 if(job.phase==='saving')return '';
 if(job.upstream_last_event_at){
  const idle=Math.max(0,Math.floor(now/1000-job.upstream_last_event_at));
  return idle>=15?`Последний сигнал AI Studio — ${idle} с назад. Ожидаю продолжение.`:'';
 }
 if(job.phase==='generate_content'||!job.phase&&job.status==='generating')return 'Подробный этап от AI Studio пока не получен.';
 return '';
}
const duration=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
export function NanoProgress({job,video=false}:{job:StudioJob;video?:boolean}){
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)setNow(Date.now())},1000);return()=>clearInterval(timer)},[]);
 const start=job.phase_started_at||job.created,seconds=start?Math.max(0,Math.floor(now/1000-start)):null;
 const total=job.created?Math.max(0,Math.floor(now/1000-job.created)):null,detail=nanoPhaseDetail(job,now);
 const kind:ActivityKind=job.phase==='thinking'?'thinking':job.phase==='saving'||job.phase==='responding'?'processing':job.phase==='image_received'||job.phase==='video_received'?'image':'model';
 return <div className="nano-progress-block"><div className="nano-progress" role="status"><ActivityIndicator kind={kind} label={nanoPhaseLabel(job,video)} identity={job.phase||job.status}/>{seconds!==null&&<time aria-live="off" aria-label="Время текущего этапа" title={total!==null?`Всего: ${duration(total)}`:undefined}>{duration(seconds)}</time>}</div>{detail&&<p className="nano-progress-detail" aria-live="off">{detail}</p>}</div>;
}
