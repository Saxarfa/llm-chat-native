import type {StudioAIStudioConfig,StudioJob} from './studioTypes';
export type NanoSettings={model:string;aspect_ratio:string;image_size:string;video_resolution?:'360p'|'720p'|'1080p'|'4k';video_duration?:number;response_mode:'text_image'|'image';thinking:'default'|'minimal'|'medium'|'high';google_search:boolean;image_search:boolean;system_instruction:string;max_output_tokens:number|null;stop_sequences:string[]};
export const nanoDefaults:NanoSettings={model:'aistudio/gemini-nano-banana-2.1',aspect_ratio:'auto',image_size:'1K',video_resolution:'720p',video_duration:5,response_mode:'text_image',thinking:'default',google_search:true,image_search:true,system_instruction:'',max_output_tokens:null,stop_sequences:[]};
export type NanoAsset={id:string;name:string;mime:string;width:number;height:number;size:number};
export type NanoPart={type:'text';text:string}|{type:'image';id:string;index:number;kind:'image'|'nano_asset'}|{type:'video';id:string;index:number;kind:'nano_video'};
export function mergeNanoText(parts:NanoPart[]):NanoPart[]{
 const merged:NanoPart[]=[];
 for(const part of parts){const previous=merged[merged.length-1];if(part.type==='text'&&previous?.type==='text')previous.text+=part.text;else merged.push({...part})}
 return merged;
}
export type NanoMessage={id:string;parent_id:string|null;role:'user'|'model';text:string;job:StudioJob;content:NanoPart[];grounding?:{sources?:{uri:string;title:string}[];attribution?:string;queries?:string[];search_links?:string[]}};
export function nanoTextOnly(message:NanoMessage){return message.role==='model'&&message.job.status==='done'&&message.job.model!=='aistudio/gemini-omni-1.1-flash'&&!message.content.some(part=>part.type==='image'||part.type==='video')&&!!(message.text.trim()||message.content.some(part=>part.type==='text'&&part.text.trim()))}
export type NanoSession={id:string;title:string;created:number;updated:number;root_job_id:string;head_id:string|null;revision:number;settings:NanoSettings;thumbnail_job_id?:string};
export type NanoView={session:NanoSession;root_job:StudioJob|null;messages:NanoMessage[];active_job:(StudioJob&{preview_text?:string;stream_revision?:number})|null};
export type NanoEntry={source?:StudioJob;repeat?:StudioJob;nonce:number};
export const nanoPending=(job?:StudioJob|null)=>!!job&&['queued','preparing','generating'].includes(job.status);
export function nanoVideoDurationDraft(text:string,seconds:number,previous?:string){
 const instruction=`Желаемая длительность видео: ${seconds} с.`;
 const known=previous||text.match(/(?:^|\n\n)(Желаемая длительность видео: (?:[3-9]|10) с\.)$/)?.[1];
 const index=known?text.lastIndexOf(known):-1;
 return {instruction,text:index>=0?text.slice(0,index)+instruction+text.slice(index+known!.length):text+(text?'\n\n':'')+instruction};
}
export function nanoFailure(job:StudioJob){
 if(['auth_required','401'].includes(job.error_code||''))return {title:'Нужно подключить Google',detail:'Открой настройки подключения AI Studio и войди в Google. Черновик сохранён.'};
 if(job.error_code==='403')return {title:'Google отклонил доступ',detail:'Проверь доступность модели и подключение AI Studio в настройках. Запрос автоматически не повторяется.'};
 if(job.error_code==='429')return {title:'Достигнут лимит Google',detail:'Подожди перед повтором. Этот запрос не будет отправлен ещё раз автоматически.'};
 if(job.error_code==='image_unavailable')return {title:'Модель сейчас недоступна',detail:'Обнови список моделей в настройках AI Studio. Разговор и вложения сохранены.'};
 if(['response_timeout','504'].includes(job.error_code||''))return {title:'Истекло время ожидания',detail:job.error_phase==='count_tokens'?'AI Studio не успела проверить контекст. Генерация ещё не началась.':'AI Studio не завершила ответ вовремя. Текст и вложения сохранены — можно подготовить повтор.'};
 if(job.error_code==='image_context_limit')return {title:'Цепочка достигла лимита',detail:'Продолжи с последнего изображения в новой цепочке.'};
 return {title:'Не удалось получить ответ',detail:job.error||'Попробуй подготовить запрос ещё раз.'};
}
export function nanoPath(messages:NanoMessage[],head:string|null){const map=new Map(messages.map(m=>[m.id,m])),result:NanoMessage[]=[],seen=new Set<string>();while(head&&!seen.has(head)){seen.add(head);const node=map.get(head);if(!node)break;result.unshift(node);head=node.parent_id}return result}

export function nanoRequestError(error:unknown,fallback='Не удалось выполнить запрос'){
 const message=error instanceof Error?error.message:'';
 if(error instanceof TypeError||/failed to fetch|load failed|networkerror|network request failed/i.test(message))return 'Связь с сервером прервалась. Текст и вложения сохранены.';
 return message||fallback;
}
export function nanoModelSettings(settings:NanoSettings,model:StudioAIStudioConfig):NanoSettings{
 return {...settings,model:model.model,video_resolution:settings.video_resolution||'720p',video_duration:settings.video_duration||5,
  aspect_ratio:model.aspect_ratios.includes(settings.aspect_ratio)?settings.aspect_ratio:'auto',
  image_size:model.image_sizes.includes(settings.image_size)?settings.image_size:model.image_sizes.includes('1K')?'1K':model.image_sizes[0]||'1K',
  google_search:settings.google_search&&!!model.features?.google_search,image_search:settings.image_search&&!!model.features?.image_search,
  thinking:model.features?.thinking_level?settings.thinking:'default',
  max_output_tokens:settings.max_output_tokens===null?null:Math.min(settings.max_output_tokens,model.output_limit||65536)};
}
