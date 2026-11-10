import {useState} from 'react';
import {Star,Loader2} from '../icons';
import {IconButton} from './primitives';
import {triggerHaptic} from '../haptics';
import type {StudioJob} from './studioTypes';

export function ArtFavoriteButton({job,onFavorite,className=''}:{job:StudioJob;onFavorite:(job:StudioJob)=>Promise<void>;className?:string}){
 const [busy,setBusy]=useState(false);
 return <IconButton showHint={false} label={job.favorite?'Убрать из избранного':'Добавить в избранное'} aria-pressed={!!job.favorite} disabled={busy} className={`art-favorite-button ${className}`} onClick={()=>{triggerHaptic('light');setBusy(true);void onFavorite(job).finally(()=>setBusy(false))}}>{busy?<Loader2 size={16} className="spin"/>:<Star size={16} fill={job.favorite?'currentColor':'none'}/>}</IconButton>;
}
