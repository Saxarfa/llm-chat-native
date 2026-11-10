import {accountKey} from '../accountStorage';
import {useEffect,useRef,useState} from 'react';
import {Dialog} from 'radix-ui';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {Check,Expand,Loader2,Square,X} from '../icons';
import {api} from '../store';
import {Button} from './primitives';
import {ArtDownload} from './ArtDownload';
import type {StudioJob} from './studioTypes';
import './ArtUpscaler.css';

type Catalog={models:{id:string;name:string;description:string}[];max_side:number;max_pixels:number;max_native_pixels:number};
const terminal=new Set(['done','error','cancelled']);
const preference='llm.upscaleModel';
const phase=(job:StudioJob)=>job.status==='queued'?'Ожидаю видеопамять':job.status==='preparing'?'Подготавливаю модель':'Увеличиваю арт';

function useArtImage(id:string|null,reload:number){
 const [image,setImage]=useState({url:'',error:''});
 useEffect(()=>{
  let active=true,url='';const controller=new AbortController();setImage({url:'',error:''});
  if(id)void (async()=>{
   try{
    const response=await fetch(`/api/images/${id}/image/0`,{headers:window.storageManager.getAuthHeaders(),signal:controller.signal});
    if(!response.ok)throw new Error('Не удалось загрузить арт');
    const blob=await response.blob();if(!active)return;
    url=URL.createObjectURL(blob);const decoded=new Image();decoded.src=url;await decoded.decode();
    if(active)setImage({url,error:''});
   }catch(e){if(active)setImage({url:'',error:e instanceof Error?e.message:String(e)})}
  })();
  return()=>{active=false;controller.abort();if(url)URL.revokeObjectURL(url)};
 },[id,reload]);
 return image;
}

export function ArtUpscaleButton({imageId}:{imageId:string}){
 const [open,setOpen]=useState(false),[selected,setSelected]=useState(imageId);
 return <><button type="button" className="art-upscale-button" aria-label="Увеличить арт" onClick={event=>{event.stopPropagation();setSelected(imageId);setOpen(true)}}><Expand size={16}/><span>Апскейл</span></button><ArtUpscaler imageId={selected} open={open} onOpenChange={setOpen}/></>;
}

export function ArtUpscaler({imageId,open,onOpenChange}:{imageId:string;open:boolean;onOpenChange:(value:boolean)=>void}){
 const dialog=useRef<HTMLDivElement>(null);
 return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="art-upscale-backdrop"/><Dialog.Content ref={dialog} className="art-upscaler" aria-describedby={undefined} onOpenAutoFocus={event=>{event.preventDefault();dialog.current?.focus({preventScroll:true})}}><header className="art-upscale-heading"><div><Dialog.Title>Увеличить арт</Dialog.Title><span>Чётче детали, выше разрешение</span></div><Dialog.Close aria-label="Закрыть апскейл"><X size={18}/></Dialog.Close></header><UpscaleSession key={imageId} imageId={imageId}/></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function UpscaleSession({imageId}:{imageId:string}){
 const reduced=useReducedMotion(),[catalog,setCatalog]=useState<Catalog|null>(null),[source,setSource]=useState<StudioJob|null>(null),[model,setModel]=useState(''),[scale,setScale]=useState<2|4>(2),[job,setJob]=useState<StudioJob|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[before,setBefore]=useState(false),[reload,setReload]=useState(0);
 const alive=useRef(true),submitting=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{
  let active=true;setError('');
  void Promise.all([api('/api/images/upscalers'),api(`/api/images/${imageId}`),api('/api/images')]).then(([values,original,history])=>{
   if(!active)return;setCatalog(values);setSource(original.job);
   let saved='';try{saved=localStorage.getItem(accountKey(preference))||''}catch{/* Storage may be unavailable. */}
   setModel(values.models.find((item:{id:string})=>item.id===saved)?.id||values.models[0]?.id||'');
   const derived=history.jobs.filter((item:StudioJob)=>item.operation==='upscale'&&item.source_id===imageId);
   const existing=derived.find((item:StudioJob)=>!terminal.has(item.status))||derived.find((item:StudioJob)=>item.status==='done');
   if(existing){setJob(existing);setModel(existing.upscale_model);setScale(existing.upscale_scale)}
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))});
  return()=>{active=false};
 },[imageId,reload]);
 const resultId=job?.status==='done'?job.id:null;
 const originalImage=useArtImage(imageId,reload),resultImage=useArtImage(resultId,reload);
 const sourceUrl=originalImage.url,resultUrl=resultImage.url,imageError=originalImage.error||resultImage.error;
 useEffect(()=>{
  if(!job||terminal.has(job.status))return;
  let active=true,timer:ReturnType<typeof setTimeout>;
  const refresh=async()=>{try{const response=await api(`/api/images/${job.id}`);if(!active)return;setJob(response.job);setError('');if(!terminal.has(response.job.status))timer=setTimeout(refresh,800)}catch(e){if(active){setError(e instanceof Error?e.message:String(e));timer=setTimeout(refresh,2000)}}};
  timer=setTimeout(refresh,500);return()=>{active=false;clearTimeout(timer)};
 },[job?.id,job?.status]);
 const pending=!!job&&!terminal.has(job.status),locked=busy||pending;
 const fits=(factor:number)=>!!source&&!!catalog&&Math.max(source.width,source.height)*factor<=catalog.max_side&&source.width*source.height*factor*factor<=catalog.max_pixels&&source.width*source.height*16<=catalog.max_native_pixels;
 const choose=(id:string)=>{setModel(id);try{localStorage.setItem(accountKey(preference),id)}catch{/* Keep session selection. */}};
 const generate=async()=>{
  if(submitting.current||locked||!fits(scale)||!model)return;submitting.current=true;setBusy(true);setError('');
  try{const response=await api(`/api/images/${imageId}/upscale`,'POST',{model,scale},90000);if(alive.current){setJob(response.job);setBefore(false)}}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}finally{submitting.current=false;if(alive.current)setBusy(false)}
 };
 const stop=async()=>{if(!job||submitting.current)return;submitting.current=true;setBusy(true);try{await api(`/api/images/${job.id}/stop`,'POST');const response=await api(`/api/images/${job.id}`);if(alive.current)setJob(response.job)}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}finally{submitting.current=false;if(alive.current)setBusy(false)}};
 const preview=resultUrl&&!before?resultUrl:sourceUrl;
 return <><div className="art-upscale-body"><div className="art-upscale-preview"><AnimatePresence initial={false}>{preview?<motion.img key={preview} src={preview} alt={resultUrl&&!before?'Увеличенный арт':'Исходный арт'} draggable={false} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:.3}}/>:<Loader2 size={24} className="spin"/>}</AnimatePresence>{pending&&<div className="art-upscale-progress" role="status"><Loader2 size={14} className="spin"/>{phase(job!)}{job?.progress!=null&&<strong>{job.progress}%</strong>}</div>}{resultUrl&&<div className="art-upscale-comparison"><button type="button" aria-pressed={before} onClick={()=>setBefore(true)}>Оригинал</button><button type="button" aria-pressed={!before} onClick={()=>setBefore(false)}>Результат</button><ArtDownload url={resultUrl} imageId={job!.id} name={`Upscale-${job!.id}`}/></div>}</div><div className="art-upscale-controls"><span className="art-upscale-label">Модель</span><div className="art-upscale-models" role="group" aria-label="Модель апскейла">{catalog?.models.map(item=><button type="button" key={item.id} disabled={locked} aria-pressed={model===item.id} onClick={()=>choose(item.id)}><span>{item.name}<small>{item.description}</small></span><Check size={16}/></button>)}</div>{!catalog&&!error&&<span className="art-upscale-note"><Loader2 size={14} className="spin"/>Проверяю модели…</span>}{catalog&&!catalog.models.length&&<p className="art-upscale-note">Модели апскейла не найдены в ComfyUI.</p>}<span className="art-upscale-label">Увеличение</span><div className="art-upscale-scales" role="group" aria-label="Масштаб апскейла">{([2,4] as const).map(factor=><button type="button" key={factor} disabled={locked||!fits(factor)} aria-pressed={scale===factor} onClick={()=>setScale(factor)}>{factor}×</button>)}</div>{source&&<div className="art-upscale-size"><span>{source.width} × {source.height}</span><span>→</span><strong>{source.width*scale} × {source.height*scale}</strong></div>}{source&&catalog&&!fits(scale)&&<p className="art-upscale-note">Для такого исходника выберите меньший масштаб.</p>}<p className="art-upscale-note">Оригинал сохранится. Увеличенный арт появится отдельно в истории.</p>{job?.status==='done'&&<p className="art-upscale-success" role="status"><Check size={14}/>Готово · {job.width} × {job.height}</p>}{job?.status==='cancelled'&&<p className="art-upscale-note" role="status">Апскейл остановлен</p>}{(error||imageError||job?.error)&&<p className="art-upscale-error" role="alert">{error||imageError||job?.error}</p>}{(error||imageError)&&!pending&&<button className="art-upscale-retry" type="button" onClick={()=>setReload(value=>value+1)}>Повторить загрузку</button>}</div></div><footer className="art-upscale-actions"><small>{pending?'Можно закрыть окно — работа продолжится':'Без изменения промпта и композиции'}</small>{pending?<Button variant="outline" disabled={busy||job?.status==='preparing'} onClick={()=>void stop()}><Square size={14}/>Остановить</Button>:<Button disabled={busy||!source||!model||!fits(scale)} onClick={()=>void generate()}>{busy?<Loader2 size={16} className="spin"/>:<Expand size={16}/>}Увеличить {scale}×</Button>}</footer></>;
}
