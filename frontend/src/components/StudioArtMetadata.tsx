import {useEffect,useRef,useState} from 'react';
import {Check,Copy} from '../icons';
import {Hint,HintButton} from './Hint';
import {copyText} from './primitives';
import {StateTransition} from './StateTransition';
import {failure} from '../store';
import {imageModelName} from './imageModels';
import type {StudioJob} from './studioTypes';
import './StudioArtDetails.css';

function SeedCopy({seed}:{seed:number}){
 const [copied,setCopied]=useState(false),timer=useRef<ReturnType<typeof setTimeout>>(undefined),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearTimeout(timer.current)}},[]);
 return <HintButton className="studio-seed-copy" hint={copied?'Seed скопирован':'Скопировать seed'} aria-label={`Скопировать seed ${seed}`} onClick={()=>{
  void copyText(String(seed)).then(()=>{if(!alive.current)return;setCopied(true);clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(false),1800)}).catch(failure);
 }}><span>Seed <span className="studio-seed-value">{seed}</span></span><StateTransition className="is-icon" stateKey={copied?'done':'copy'}>{copied?<Check size={12}/>:<Copy size={12}/>}</StateTransition><span className="sr-only" role="status">{copied?'Seed скопирован':''}</span></HintButton>;
}

export function StudioArtMetadata({job}:{job:StudioJob}){
 const name=job.model?imageModelName(job.model):'';
 return <div className="studio-art-metadata" aria-label="Параметры выбранного арта">
  <div className="studio-art-spec-line"><span>{job.width} × {job.height}</span>{job.operation==='upscale'?<span>Апскейл {job.upscale_scale}×</span>:job.steps!=null?<span>{job.steps} шаг.</span>:job.image_size?<span>{job.image_size}</span>:null}{job.seed!=null&&<SeedCopy key={`${job.id}:${job.seed}`} seed={job.seed}/>}</div>
  {name&&<Hint text={name}><span className="studio-art-model-name" tabIndex={0}>{name}</span></Hint>}
 </div>;
}
