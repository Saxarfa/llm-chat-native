import type {Source} from './types';

// Google Search grounding returns redirect links on this host; the real site is
// only present in the citation title (for example "youtube.com").
const GOOGLE_REDIRECT_HOST=/(^|\.)vertexaisearch\.cloud\.google\.com$/i;
const DOMAIN_LIKE=/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const bareHost=(value:string)=>value.trim().toLowerCase().replace(/^www\./,'');
function parseHttp(value?:string){
 try{const url=new URL(value||'');return url.protocol==='https:'||url.protocol==='http:'?url:null}catch{return null}
}

/** Real site host of a source ('' when it cannot be determined). */
export function sourceHost(source:Source):string{
 if(source.kind==='knowledge')return source.site_name||'';
 const resolved=parseHttp(source.resolved_url);
 if(resolved&&!GOOGLE_REDIRECT_HOST.test(resolved.hostname))return bareHost(resolved.hostname);
 const url=parseHttp(source.url);
 if(!url)return bareHost(source.site_name||'');
 if(!GOOGLE_REDIRECT_HOST.test(url.hostname))return bareHost(url.hostname);
 for(const candidate of [source.title,source.site_name]){
  const host=bareHost(candidate||'');
  if(DOMAIN_LIKE.test(host))return host;
 }
 return '';
}

/** Favicon URL on the real site, or '' for knowledge sources and unknown hosts. */
export function sourceIconUrl(source:Source):string{
 if(source.kind==='knowledge')return '';
 const resolved=parseHttp(source.resolved_url),url=parseHttp(source.url);
 const known=resolved&&!GOOGLE_REDIRECT_HOST.test(resolved.hostname)?resolved:url&&!GOOGLE_REDIRECT_HOST.test(url.hostname)?url:null;
 if(known)return known.origin+'/favicon.ico';
 const host=sourceHost(source);
 return host?'https://'+host+'/favicon.ico':'';
}

/** Primary line: the page title, or the host when the title only repeats it. */
export function sourceTitle(source:Source,host=sourceHost(source)):string{
 const title=(source.title||'').trim();
 return title||host||source.site_name||'Источник';
}

/** Secondary host line; empty when the title already is the host. */
export function sourceHostLine(source:Source,host=sourceHost(source)):string{
 if(!host)return '';
 return bareHost(sourceTitle(source,host))===bareHost(host)?'':host;
}

/** Status line without generic labels that every row would repeat. */
export function sourceNote(source:Source):string{
 const note=sourceDetails(source);
 return source.kind!=='knowledge'&&(note==='Источник Google'||note==='Источник')?'':note;
}

export function sourceDetails(source:Source){
 if(source.kind==='knowledge')return ['База знаний',source.heading||'',source.page?'Страница '+source.page:'',source.revision?'Версия '+source.revision:''].filter(Boolean).join(' · ');
 // Google performs retrieval internally. Its citation alone does not disclose
 // whether Search or URL Context supplied the evidence.
 const status=source.read===true?'Прочитано':source.read_error?'Страница недоступна · выдержка из поиска':source.provider==='google'?'Источник Google':source.read===false?'Поисковая выдержка':'Источник';
 const parts=[status];
 if(source.format==='pdf')parts.push('PDF');
 if(source.published_date){
  const date=new Date(source.published_date);
  if(Number.isFinite(date.getTime()))parts.push('Опубликовано '+date.toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}));
 }
 return parts.join(' · ');
}
