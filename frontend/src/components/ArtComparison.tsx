import {useEffect,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent} from 'react';
import {Dialog} from 'radix-ui';
import {ArrowLeftRight,Columns2,PanelLeft,Plus,Minus,X,ChevronsLeftRight,Loader2,RotateCcw} from '../icons';
import {IconButton,Disclosure} from './primitives';
import {SelectionHighlight} from './SelectionHighlight';
import {StudioFilmstrip} from './StudioFilmstrip';
import {imageModelName} from './imageModels';
import {fitArtRect} from './artViewerGeometry';
import type {StudioJob} from './studioTypes';
import './ArtComparison.css';

type View={zoom:number;x:number;y:number};
type Point={x:number;y:number};
const initialView:View={zoom:1,x:0,y:0};
const limit=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const bound=(view:View):View=>{const edge=(view.zoom-1)/2;return {...view,x:limit(view.x,-edge,edge),y:limit(view.y,-edge,edge)}};
const zoomAt=(view:View,zoom:number,point:Point):View=>{
 const next=limit(zoom,1,8),ratio=next/view.zoom;
 return bound({zoom:next,x:point.x-(point.x-view.x)*ratio,y:point.y-(point.y-view.y)*ratio});
};

// Each side owns its URL, independently of the live studio canvas.
function useComparisonImage(job:StudioJob){
 const id=job.id,committed=useRef('');
 const [state,setState]=useState<{job:StudioJob|null;url:string;error:string}>({job:null,url:'',error:''});
 const [revision,retry]=useState(0);
 useEffect(()=>()=>{if(committed.current)URL.revokeObjectURL(committed.current)},[]);
 useEffect(()=>{
  let alive=true,url='',published=false;const controller=new AbortController();setState(current=>({...current,error:''}));
  void(async()=>{
   try{
    const response=await fetch(`/api/images/${encodeURIComponent(id)}/image/0`,{headers:window.storageManager.getAuthHeaders(),signal:controller.signal});
    if(!response.ok)throw new Error(response.status===404?'Файл арта не найден':'Не удалось загрузить арт');
    const blob=await response.blob();if(!alive)return;
    url=URL.createObjectURL(blob);const image=new Image();image.src=url;await image.decode();
    if(alive){const previous=committed.current;committed.current=url;published=true;setState({job,url,error:''});if(previous)URL.revokeObjectURL(previous)}else URL.revokeObjectURL(url);
   }catch(error){if(url){URL.revokeObjectURL(url);url=''}if(alive)setState(current=>({...current,error:error instanceof Error&&error.message==='Файл арта не найден'?error.message:'Не удалось загрузить арт'}))}
  })();
  return()=>{alive=false;controller.abort();if(url&&!published)URL.revokeObjectURL(url)};
 },[id,revision]);
 return {...state,pending:state.job?.id!==id,retry:()=>retry(value=>value+1)};
}

function comparisonRows(a:StudioJob,b:StudioJob){
 const value=(input:unknown)=>input===undefined||input===null||input===''?'—':String(input);
 const loras=(job:StudioJob)=>job.loras===undefined?'—':job.loras.length?job.loras.map(lora=>`${lora.name.replace(/\.safetensors$/i,'')} · ${lora.strength}${lora.strength_clip!=null?` / CLIP ${lora.strength_clip}`:''}`).sort().join('\n'):'Нет';
 const specs:[string,(job:StudioJob)=>string][]=[
  ['Модель',job=>job.model?imageModelName(job.model):'—'],['Размер',job=>`${job.width} × ${job.height}`],['Seed',job=>value(job.seed)],
  ['Шаги',job=>job.operation==='upscale'?'—':value(job.steps)],['CFG',job=>value(job.cfg)],['Семплер',job=>value(job.sampler)],
  ['Scheduler',job=>value(job.scheduler)],['Denoise',job=>value(job.denoise)],['LoRA',loras],
  ['Промпт',job=>value(job.prompt)],['Негативный промпт',job=>value(job.negative)],
 ];
 if(a.operation==='upscale'||b.operation==='upscale')specs.push(['Апскейл',job=>job.operation==='upscale'?`${job.upscale_scale}× · ${job.upscale_model||'—'}`:'Нет']);
 return specs.map(([label,read])=>({label,a:read(a),b:read(b)})).map(row=>({...row,different:row.a!==row.b}));
}

export function ArtComparison({open,onOpenChange,jobs,initialId,restoreFocus}:{open:boolean;onOpenChange:(open:boolean)=>void;jobs:StudioJob[];initialId:string;restoreFocus:()=>void}){
 return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal>
  <Dialog.Overlay className="art-compare-backdrop"/>
  <Dialog.Content className="art-compare" aria-describedby="art-compare-help" onCloseAutoFocus={event=>{event.preventDefault();restoreFocus()}}>
   <ComparisonWorkspace jobs={jobs} initialId={initialId}/>
  </Dialog.Content>
 </Dialog.Portal></Dialog.Root>;
}

function ComparisonWorkspace({jobs,initialId}:{jobs:StudioJob[];initialId:string}){
 const first=jobs.find(job=>job.id===initialId)||jobs[0];
 // Prefer the original when comparing an upscale; otherwise choose its neighbour.
 const second=jobs.find(job=>job.id===first.source_id)||jobs[jobs.indexOf(first)+1]||jobs.find(job=>job.id!==first.id)!;
 const [pair,setPair]=useState<[StudioJob,StudioJob]>([first,second]),[active,setActive]=useState<0|1>(1);
 const [mode,setMode]=useState<'side'|'wipe'>('side'),[split,setSplit]=useState(50),[view,setView]=useState(initialView),[onlyChanges,setOnlyChanges]=useState(true);
 const a=useComparisonImage(pair[0]),b=useComparisonImage(pair[1]),frames=[a,b];
 const live=useRef(view);live.current=view;
 const stage=useRef<HTMLDivElement>(null),modes=useRef<HTMLDivElement>(null),pointers=useRef(new Map<number,Point>()),gestureSurface=useRef<HTMLElement|null>(null);
 const [stageSize,setStageSize]=useState({width:1,height:1});
 useEffect(()=>{
  const host=stage.current;if(!host)return;
  const observer=new ResizeObserver(([entry])=>{const {width,height}=entry.contentRect;setStageSize(current=>current.width===width&&current.height===height?current:{width,height})});
  observer.observe(host);return()=>observer.disconnect();
 },[]);
 const wipeJob=a.job||pair[0],wipeSize=fitArtRect({x:0,y:0,...stageSize},wipeJob.width/wipeJob.height);
 const rows=comparisonRows(...pair),differences=rows.filter(row=>row.different);
 const ready=!!a.url&&!!b.url&&!a.pending&&!b.pending;
 const apply=(next:View)=>{live.current=next;setView(next)};
 const reset=()=>{pointers.current.clear();gestureSurface.current=null;apply(initialView)};
 const select=(job:StudioJob)=>{
  if(job.id===pair[active].id)return;
  setPair(current=>job.id===current[active===0?1:0].id?[current[1],current[0]]:active===0?[job,current[1]]:[current[0],job]);reset();
 };
 useEffect(()=>{
  const host=stage.current;if(!host)return;
  const wheel=(event:WheelEvent)=>{
   const surface=(event.target as Element).closest<HTMLElement>('[data-compare-surface]');if(!surface||!ready)return;
   event.preventDefault();const rect=surface.getBoundingClientRect();
   apply(zoomAt(live.current,live.current.zoom*Math.exp(-limit(event.deltaY*(event.deltaMode===1?16:1),-120,120)*.0025),{x:(event.clientX-rect.left)/rect.width-.5,y:(event.clientY-rect.top)/rect.height-.5}));
  };
  host.addEventListener('wheel',wheel,{passive:false});return()=>host.removeEventListener('wheel',wheel);
 },[ready]);
 const onPointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
  if(!ready||(event.pointerType==='mouse'&&event.button!==0))return;
  if(pointers.current.size&&gestureSurface.current!==event.currentTarget)return;
  gestureSurface.current=event.currentTarget;event.currentTarget.setPointerCapture(event.pointerId);pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
 };
 const onPointerMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
  const previous=pointers.current.get(event.pointerId);if(!previous)return;
  const old=[...pointers.current.values()];pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
  const next=[...pointers.current.values()],rect=event.currentTarget.getBoundingClientRect();
  if(next.length===1){apply(bound({...live.current,x:live.current.x+(event.clientX-previous.x)/rect.width,y:live.current.y+(event.clientY-previous.y)/rect.height}));return}
  if(next.length!==2)return;
  const distance=(points:Point[])=>Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
  const midpoint=(points:Point[])=>({x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2});
  const before=midpoint(old),after=midpoint(next),zoomed=zoomAt(live.current,live.current.zoom*distance(next)/Math.max(1,distance(old)),{x:(before.x-rect.left)/rect.width-.5,y:(before.y-rect.top)/rect.height-.5});
  apply(bound({...zoomed,x:zoomed.x+(after.x-before.x)/rect.width,y:zoomed.y+(after.y-before.y)/rect.height}));
 };
 const onPointerEnd=(event:ReactPointerEvent<HTMLDivElement>)=>{pointers.current.delete(event.pointerId);if(!pointers.current.size)gestureSurface.current=null};
 const surfaceProps={
  'data-compare-surface':true,tabIndex:0,onPointerDown,onPointerMove,onPointerUp:onPointerEnd,onPointerCancel:onPointerEnd,onLostPointerCapture:onPointerEnd,
  onDoubleClick:()=>apply(live.current.zoom>1?initialView:{zoom:2,x:0,y:0}),
  onKeyDown:(event:React.KeyboardEvent<HTMLDivElement>)=>{
   if(!ready||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','0'].includes(event.key))return;
   event.preventDefault();event.stopPropagation();
   if(event.key==='0')reset();
   else if(['+','=','-'].includes(event.key))apply(zoomAt(live.current,live.current.zoom*(event.key==='-'?1/1.5:1.5),{x:0,y:0}));
   else apply(bound({...live.current,x:live.current.x+(event.key==='ArrowRight'?-.08:event.key==='ArrowLeft'?.08:0),y:live.current.y+(event.key==='ArrowDown'?-.08:event.key==='ArrowUp'?.08:0)}));
  },
 };
 const transform:CSSProperties={transform:`translate(${view.x*100}%,${view.y*100}%) scale(${view.zoom})`};
 const image=(index:0|1)=><div className="art-compare-image-layer" style={transform} data-side={index===0?'A':'B'}><img draggable={false} src={frames[index].url} alt={`Арт ${index===0?'A':'B'}: ${(frames[index].job||pair[index]).prompt}`}/></div>;
 const status=(index:0|1)=><div className="art-compare-load" role={frames[index].error?'alert':'status'}>{frames[index].error?<><span>{frames[index].error}</span><button type="button" onClick={frames[index].retry}><RotateCcw size={14}/>Повторить загрузку</button></>:<><Loader2 size={18} className="spin"/><span>Загружаю арт {index===0?'A':'B'}…</span></>}</div>;
 const updateSplit=(event:ReactPointerEvent<HTMLButtonElement>)=>{const rect=event.currentTarget.parentElement!.getBoundingClientRect();setSplit(limit((event.clientX-rect.left)/rect.width*100,0,100))};
 return <>
  <header className="art-compare-header"><Dialog.Title>Сравнение артов</Dialog.Title><Dialog.Close asChild><IconButton label="Закрыть сравнение"><X size={18}/></IconButton></Dialog.Close></header>
  <div className="art-compare-toolbar">
   <div ref={modes} className="art-compare-modes animated-choice-group" role="group" aria-label="Режим сравнения">
    <button type="button" aria-pressed={mode==='side'} onClick={()=>{setMode('side');reset()}}><Columns2 size={16}/>Рядом</button>
    <button type="button" aria-pressed={mode==='wipe'} onClick={()=>{setMode('wipe');reset()}}><PanelLeft size={16}/>Шторка</button><SelectionHighlight container={modes} activeKey={mode} className="choice-highlight"/>
   </div>
   <div className="art-compare-zoom" role="group" aria-label="Общий масштаб"><IconButton label="Уменьшить оба арта" disabled={!ready||view.zoom<=1} onClick={()=>apply(zoomAt(view,view.zoom/1.5,{x:0,y:0}))}><Minus size={16}/></IconButton><button type="button" aria-label="Сбросить масштаб сравнения" onClick={reset}>{Math.round(view.zoom*100)}%</button><IconButton label="Увеличить оба арта" disabled={!ready||view.zoom>=8} onClick={()=>apply(zoomAt(view,view.zoom*1.5,{x:0,y:0}))}><Plus size={16}/></IconButton></div>
   <IconButton label="Поменять арты местами" onClick={()=>{setPair([pair[1],pair[0]]);setSplit(100-split);reset()}}><ArrowLeftRight size={16}/></IconButton>
  </div>
  <div className="art-compare-slots" role="group" aria-label="Какой арт заменить">
   {pair.map((job,index)=><button key={index} type="button" aria-pressed={active===index} aria-label={`Выбрать арт ${index===0?'A':'B'} для замены`} onClick={()=>setActive(index as 0|1)}><span className="art-compare-letter">{index===0?'A':'B'}</span><span><strong>Арт {jobs.length-jobs.findIndex(item=>item.id===job.id)}</strong><small>{job.width} × {job.height}{job.seed!=null?` · Seed ${job.seed}`:job.image_size?` · ${job.image_size}`:''}</small></span></button>)}
  </div>
  <div ref={stage} className={`art-compare-stage is-${mode}`} data-zoom={view.zoom}>
   {mode==='side'?([0,1] as const).map(index=><div key={index} {...surfaceProps} className="art-compare-surface" aria-busy={frames[index].pending} aria-label={`Арт ${index===0?'A':'B'}: масштаб и перемещение`}>{frames[index].url&&image(index)}{(!frames[index].url||frames[index].pending||frames[index].error)&&status(index)}</div>):<div {...surfaceProps} className="art-compare-surface" style={{width:wipeSize.width,height:wipeSize.height}} aria-busy={!ready} aria-label="Арты со шторкой: масштаб и перемещение">
    {a.url&&b.url?<>{image(1)}<div className="art-compare-wipe-layer" style={{clipPath:`inset(0 ${100-split}% 0 0)`}}>{image(0)}</div>
     <button type="button" role="slider" className="art-compare-divider" disabled={!ready} aria-label="Положение шторки" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)} aria-valuetext={`Арт A ${Math.round(split)}%, арт B ${Math.round(100-split)}%`} style={{left:`${split}%`}} onPointerDown={event=>{event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);updateSplit(event)}} onPointerMove={event=>{event.stopPropagation();if(event.currentTarget.hasPointerCapture(event.pointerId))updateSplit(event)}} onPointerUp={event=>{event.stopPropagation();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}} onDoubleClick={event=>{event.stopPropagation();setSplit(50)}} onKeyDown={event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();setSplit(value=>event.key==='Home'?0:event.key==='End'?100:limit(value+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?10:2),0,100));
     }}><span><ChevronsLeftRight size={18}/></span></button>
    </>:null}{!ready&&<div className="art-compare-loading-pair">{(!a.url||a.pending||a.error)&&status(0)}{(!b.url||b.pending||b.error)&&status(1)}</div>}
   </div>}
  </div>
  <p id="art-compare-help" className="art-compare-help"><span className="art-compare-desktop-help">Колёсико — масштаб · перетаскивание — перемещение · двойной клик — приблизить или сбросить</span><span className="art-compare-touch-help">Два пальца — масштаб · потяни увеличенный арт, чтобы рассмотреть детали</span>{mode==='wipe'&&pair[0].width/pair[0].height!==pair[1].width/pair[1].height&&<span>Разные пропорции: изображения показаны целиком.</span>}</p>
  <StudioFilmstrip jobs={jobs} selected={pair[active].id} loading={frames[active].pending&&!frames[active].error?pair[active].id:undefined} onSelect={select} heading={`Выберите арт ${active===0?'A':'B'}`} showLatest={false} maxItems={jobs.length}/>
  <Disclosure className="art-compare-parameters" title={`Различия в параметрах · ${differences.length}`}>
   <label className="art-compare-filter"><input type="checkbox" checked={onlyChanges} onChange={event=>setOnlyChanges(event.target.checked)}/>Только различия</label>
   {onlyChanges&&!differences.length?<p className="art-compare-identical">Параметры совпадают</p>:<table><thead><tr><th scope="col">Параметр</th><th scope="col">Арт A</th><th scope="col">Арт B</th></tr></thead><tbody>{(onlyChanges?differences:rows).map(row=><tr key={row.label} className={row.different?'is-different':''}><th scope="row">{row.label}</th><td>{row.a}</td><td>{row.b}</td></tr>)}</tbody></table>}
  </Disclosure>
 </>;
}
