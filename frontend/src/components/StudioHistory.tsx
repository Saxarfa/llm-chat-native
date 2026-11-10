import {useEffect,useRef,useState,useCallback} from 'react';
import {SelectionHighlight} from './SelectionHighlight';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {motionEase} from '../motion';
import {ImagePlus,Trash2,Check,Search,X,Download,ListChecks,ChevronLeft,ChevronRight} from '../icons';
import {Button,IconButton} from './primitives';
import {Select,SelectOption} from './Select';
import {Reveal} from './Reveal';
import {ActivityIndicator} from './ActivityIndicator';
import {api,notify} from '../store';
import {pollVisible} from '../visiblePolling';
import {useSnapshotState} from '../useSnapshotState';
import {imageModelName} from './imageModels';
import {downloadSelectedArts} from './studioHistoryDownload';
import type {StudioJob} from './studioTypes';
import './StudioHistory.css';
import {ArtFavoriteButton} from './ArtFavoriteButton';

export function StudioThumbnail({job}:{job:StudioJob}){
 const host=useRef<HTMLSpanElement>(null),[visible,setVisible]=useState(false),[url,setUrl]=useState(''),[failed,setFailed]=useState(false);
 useEffect(()=>{const element=host.current;if(!element)return;const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect()}},{rootMargin:'100px'});observer.observe(element);return()=>observer.disconnect()},[]);
 useEffect(()=>{
  if(!visible)return;let alive=true,blobUrl='';const controller=new AbortController();
  void fetch(`/api/images/${encodeURIComponent(job.id)}/image/0?preview=true&v=2`,{headers:window.storageManager.getAuthHeaders(),signal:controller.signal}).then(async response=>{if(!response.ok)throw Error();blobUrl=URL.createObjectURL(await response.blob());const image=new Image();image.src=blobUrl;await image.decode();if(alive)setUrl(blobUrl);else URL.revokeObjectURL(blobUrl)}).catch(()=>{if(alive)setFailed(true)});
  return()=>{alive=false;controller.abort();if(blobUrl)URL.revokeObjectURL(blobUrl)};
 },[visible,job.id]);
 return <span ref={host} className={`studio-history-thumbnail ${url?'is-ready':''} ${failed?'is-failed':''}`} aria-hidden="true">{url?<img src={url} alt="" draggable={false} onError={()=>setFailed(true)}/>:<ImagePlus size={20}/>}</span>;
}

type HistoryData={jobs:StudioJob[];total:number;all_count:number;favorite_count:number;models:string[]};
const PAGE_SIZE=40;
function dates(period:string,from:string,to:string){
 const start=new Date();start.setHours(0,0,0,0);
 if(period==='today')return {after:start.getTime()/1000};
 if(period==='week'||period==='month'){start.setDate(start.getDate()-(period==='week'?6:29));return {after:start.getTime()/1000}}
 if(period==='custom'){
  const end=to?new Date(to+'T00:00:00'):null;if(end)end.setDate(end.getDate()+1);
  return {after:from?new Date(from+'T00:00:00').getTime()/1000:undefined,before:end?end.getTime()/1000:undefined};
 }
 return {};
}
export function StudioHistory({jobs,selected,deleting,onOpen,onDelete,onFavorite,onDeleteMany,undo,onRestore,grid=false}:{jobs:StudioJob[];selected?:string;deleting:boolean;onOpen:(job:StudioJob,source:HTMLElement)=>void;onDelete:(job:StudioJob)=>void;onFavorite:(job:StudioJob)=>Promise<void>;onDeleteMany:(ids:string[])=>Promise<void>;undo?:string;onRestore:()=>void;grid?:boolean}){
 const reduced=useReducedMotion(),filters=useRef<HTMLDivElement>(null),host=useRef<HTMLDivElement>(null);
 const [favoritesOnly,setFavoritesOnly]=useState(false),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[model,setModel]=useState(''),[kind,setKind]=useState('all'),[period,setPeriod]=useState('all'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[order,setOrder]=useState('newest'),[page,setPage]=useState(0),[listKey,setListKey]=useState('');
 const [data,setData]=useSnapshotState<HistoryData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[actionError,setActionError]=useState(''),[picking,setPicking]=useState(false),[picked,setPicked]=useState<Set<string>>(new Set()),[operation,setOperation]=useState('');
 const alive=useRef(true),epoch=useRef(0),busy=useRef(false),download=useRef<AbortController|null>(null);
 const blocked=deleting||!!operation;
 const invalidDates=period==='custom'&&!!from&&!!to&&from>to;
 const signature=JSON.stringify(jobs.map(job=>[job.id,job.favorite]));
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(0)},250);return()=>clearTimeout(timer)},[search]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;++epoch.current;download.current?.abort()}},[]);
 const refresh=useCallback(async()=>{
  if(invalidDates){setLoading(false);return}
  const ticket=++epoch.current;const params={q:query,favorite:favoritesOnly,model,kind,order,offset:page*PAGE_SIZE,limit:PAGE_SIZE,...dates(period,from,to)};const key=JSON.stringify([query,favoritesOnly,model,kind,order,page,period,from,to]);
  try{const next:HistoryData=await api('/api/images/history/search','POST',params);if(!alive.current||ticket!==epoch.current)return;
   if(page&&page*PAGE_SIZE>=next.total){setPage(Math.max(0,Math.ceil(next.total/PAGE_SIZE)-1));return}
   setData(next);setListKey(key);setError('');setPicked(old=>new Set([...old].filter(id=>next.jobs.some(job=>job.id===id))));
  }catch(e){if(alive.current&&ticket===epoch.current)setError(e instanceof Error?e.message:'Не удалось загрузить историю.')}
  finally{if(alive.current&&ticket===epoch.current)setLoading(false)}
 },[query,favoritesOnly,model,kind,order,period,from,to,page,invalidDates]);
 useEffect(()=>{setLoading(true);setPicked(new Set());const stop=pollVisible(refresh,15000);return()=>{stop();++epoch.current}},[refresh]);
 useEffect(()=>{void refresh()},[signature]);
 useEffect(()=>{const changed=()=>void refresh();window.addEventListener('studio-history-changed',changed);window.addEventListener('focus',changed);return()=>{window.removeEventListener('studio-history-changed',changed);window.removeEventListener('focus',changed)}},[refresh]);
 const shown=data?.jobs||[],change=(set:(value:string)=>void,value:string)=>{set(value);setPage(0)};
 const reset=()=>{setSearch('');setQuery('');setFavoritesOnly(false);setModel('');setKind('all');setPeriod('all');setFrom('');setTo('');setOrder('newest');setPage(0)};
 const toggle=(id:string)=>setPicked(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next});
 const run=async(action:'download'|'delete')=>{
  if(busy.current||blocked||!picked.size)return;busy.current=true;setOperation(action);setActionError('');const ids=[...picked];
  try{if(action==='download'){download.current=new AbortController();await downloadSelectedArts(ids,download.current.signal);if(alive.current)notify('Архив артов скачан')}else{await onDeleteMany(ids);if(alive.current){setPicked(new Set());setPicking(false);await refresh()}}}
  catch(e){if(alive.current&&!download.current?.signal.aborted)setActionError(e instanceof Error?e.message:'Не удалось выполнить действие.')}
  finally{busy.current=false;download.current=null;if(alive.current)setOperation('')}
 };
 const hasFilters=!!query||favoritesOnly||!!model||kind!=='all'||period!=='all';
 const historyLayout=JSON.stringify([grid,shown.map(job=>job.id)]);
 return <div ref={host} className="studio-history-browser">
  <fieldset className="studio-history-controls" disabled={blocked}>
   <div className="studio-history-search"><Search size={16}/><input type="search" aria-label="Поиск по промпту" placeholder="Поиск по промпту…" value={search} maxLength={300} onChange={e=>setSearch(e.target.value)}/>{search&&<IconButton label="Очистить поиск" onClick={()=>setSearch('')}><X size={14}/></IconButton>}</div>
   <div ref={filters} className="studio-history-filters animated-choice-group" role="group" aria-label="Показать арты"><button type="button" aria-pressed={!favoritesOnly} onClick={()=>{setFavoritesOnly(false);setPage(0)}}>Все{data?` · ${data.all_count}`:''}</button><button type="button" aria-pressed={favoritesOnly} onClick={()=>{setFavoritesOnly(true);setPage(0)}}>Избранное{data?` · ${data.favorite_count}`:''}</button><SelectionHighlight container={filters} activeKey={String(favoritesOnly)} className="choice-highlight"/></div>
   <div className="studio-history-selects">
    <Select aria-label="Модель в истории" value={model} displayValue={model?imageModelName(model):'Все модели'} onChange={e=>change(setModel,e.target.value)}><SelectOption value="">Все модели</SelectOption>{[...new Set([...(data?.models||[]),...(model?[model]:[])])].map(name=><SelectOption key={name} value={name}>{imageModelName(name)}</SelectOption>)}</Select>
    <Select aria-label="Тип арта" value={kind} onChange={e=>change(setKind,e.target.value)}><SelectOption value="all">Все типы</SelectOption><SelectOption value="generation">Генерации</SelectOption><SelectOption value="upscale">Апскейлы</SelectOption></Select>
    <Select aria-label="Период истории" value={period} onChange={e=>change(setPeriod,e.target.value)}><SelectOption value="all">За всё время</SelectOption><SelectOption value="today">Сегодня</SelectOption><SelectOption value="week">Последние 7 дней</SelectOption><SelectOption value="month">Последние 30 дней</SelectOption><SelectOption value="custom">Выбрать даты</SelectOption></Select>
    <Select aria-label="Сортировка артов" value={order} onChange={e=>change(setOrder,e.target.value)}><SelectOption value="newest">Сначала новые</SelectOption><SelectOption value="oldest">Сначала старые</SelectOption></Select>
   </div>
   <Reveal show={period==='custom'}><div className="studio-history-dates"><label>С<input type="date" aria-label="С даты" value={from} onChange={e=>change(setFrom,e.target.value)}/></label><label>По<input type="date" aria-label="По дату" value={to} onChange={e=>change(setTo,e.target.value)}/></label></div></Reveal>
   <div className="studio-history-result-line"><span role="status">{loading?'Загружаю…':data?`Найдено: ${data.total}`:''}</span>{hasFilters&&<button type="button" onClick={reset}>Сбросить фильтры</button>}<button type="button" className="studio-history-pick-toggle" aria-pressed={picking} disabled={!shown.length&&!picking} onClick={()=>{setPicking(!picking);setPicked(new Set())}}><ListChecks size={14}/>{picking?'Готово':'Выбрать'}</button></div>
  </fieldset>
  {picking&&<div className="studio-history-batch"><div><span>Выбрано: {picked.size}</span><button type="button" disabled={blocked||!shown.length} onClick={()=>setPicked(picked.size===shown.length?new Set():new Set(shown.map(job=>job.id)))}>{picked.size===shown.length?'Снять выбор':'Все на странице'}</button></div><div><Button type="button" variant="outline" disabled={blocked||!picked.size} onClick={()=>void run('download')}><Download size={14}/>Скачать ZIP</Button><Button type="button" variant="ghost" disabled={blocked||!picked.size} onClick={()=>void run('delete')}><Trash2 size={14}/>Удалить выбранные</Button></div></div>}
  {operation&&<div className="studio-history-operation" role="status"><ActivityIndicator kind="processing" label={operation==='download'?'Собираю архив…':'Удаляю выбранные арты…'}/>{operation==='download'&&<button type="button" onClick={()=>download.current?.abort()}>Отменить</button>}</div>}
  {undo&&<div className="studio-history-undo"><span>{undo}</span><button type="button" disabled={blocked} onClick={onRestore}>Вернуть</button></div>}
  {(error||actionError||invalidDates)&&<p className="studio-history-error" role="alert">{invalidDates?'Дата начала должна быть не позже даты окончания.':actionError||error}{error&&<button type="button" onClick={()=>void refresh()}>Повторить</button>}</p>}
  {!invalidDates&&<div className={`studio-history-gallery ${grid?'is-grid':'is-list'} ${picking?'is-picking':''}`} aria-busy={loading} inert={loading&&!!data}><AnimatePresence key={listKey} initial={false}>{shown.map((job,index)=>{
   const number=page*PAGE_SIZE+index+1,name=job.prompt||`Арт ${number}`,checked=picked.has(job.id);
   return <motion.div layout="position" layoutDependency={historyLayout} className={`studio-history-card ${selected===job.id?'is-selected':''} ${checked?'is-picked':''}`} key={job.id} initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:reduced?0:.22,ease:motionEase}}>
    <button type="button" className="studio-history-preview" role={picking?'checkbox':undefined} aria-checked={picking?checked:undefined} aria-label={picking?`Выбрать арт ${number}`:`Открыть арт: ${name.slice(0,100)}`} aria-pressed={picking?undefined:selected===job.id} disabled={blocked} onClick={event=>picking?toggle(job.id):onOpen(job,event.currentTarget)}>{picking&&<span className="studio-history-check" aria-hidden="true">{checked&&<Check size={14}/>}</span>}<StudioThumbnail job={job}/><span className="studio-history-caption"><strong>{name}</strong><small>{job.width} × {job.height}{job.operation==='upscale'?` · Апскейл ${job.upscale_scale}×`:''} · {new Date(job.created*1000).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></span>{!picking&&selected===job.id&&<span className="studio-history-selected"><Check size={12}/></span>}</button>
    {!picking&&<div className="studio-history-card-actions"><ArtFavoriteButton job={job} onFavorite={async job=>{await onFavorite(job);void refresh()}} className="studio-history-favorite"/><IconButton label={`Удалить арт ${number} из истории`} className="studio-history-delete" disabled={blocked} onClick={()=>onDelete(job)}><Trash2 size={16}/>{grid&&<span>Удалить</span>}</IconButton></div>}
   </motion.div>;
  })}</AnimatePresence>{!loading&&!error&&!shown.length&&<div className="studio-gallery-empty"><ImagePlus size={28}/><strong>{hasFilters?'Ничего не найдено':'Здесь будут твои арты'}</strong><span>{hasFilters?'Попробуйте другой запрос или сбросьте фильтры':'Создай первое изображение'}</span></div>}</div>}
  {!!data?.total&&data.total>PAGE_SIZE&&<nav className="studio-history-pages" aria-label="Страницы истории"><IconButton label="Предыдущая страница артов" disabled={!page||loading||blocked} onClick={()=>{setPage(page-1);host.current?.scrollIntoView({block:'nearest'})}}><ChevronLeft size={16}/></IconButton><span>{page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,data.total)} из {data.total}</span><IconButton label="Следующая страница артов" disabled={(page+1)*PAGE_SIZE>=data.total||loading||blocked} onClick={()=>{setPage(page+1);host.current?.scrollIntoView({block:'nearest'})}}><ChevronRight size={16}/></IconButton></nav>}
 </div>;
}
