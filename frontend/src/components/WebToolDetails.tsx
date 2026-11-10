import {useState} from 'react';
import {safeUrl} from '../domain';
import type {Source,ToolEvent,WebSearchHit} from '../types';

function host(url:string){try{return new URL(url).hostname.replace(/^www\./,'')}catch{return url}}

function EvidenceText({text,snippet=false}:{text:string;snippet?:boolean}){
 const[expanded,setExpanded]=useState(false),long=text.length>360;
 const preview=Array.from(text).slice(0,360).join('');
 return <div className={`web-evidence-text ${expanded?'is-expanded':''}`}>
  <p>{expanded||!long?text:preview+'…'}</p>
  {long&&<button type="button" className="web-evidence-toggle" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Свернуть':snippet?'Показать весь сниппет':`Показать весь текст · ${text.length.toLocaleString('ru-RU')} знаков`}</button>}
 </div>;
}

function Result({hit,legacy=false}:{hit:WebSearchHit;legacy?:boolean}){
 const href=safeUrl(hit.url);
 return <li className="web-search-result">
  <div className="web-result-heading">{hit.citation!=null&&<span className="web-result-number">[{hit.citation}]</span>}{href?<a href={href} target="_blank" rel="noopener noreferrer">{hit.title||host(hit.url)}</a>:<span>{hit.title||host(hit.url)}</span>}</div>
  <small className="web-result-meta">{host(hit.url)}{hit.published_date&&` · ${hit.published_date}`}</small>
  {hit.snippet?<EvidenceText text={hit.snippet} snippet/>:!legacy&&<small className="web-result-meta">Сниппет не предоставлен поисковиком</small>}
 </li>;
}

export function WebToolDetails({event,sources=[]}:{event:ToolEvent;sources?:Source[]}){
 if(event.name!=='web_search'&&event.name!=='fetch_url')return null;
 const result=event.web_result;
 if(!result){
  if(event.status==='running')return event.focus?<p className="web-read-focus">Что ищем на странице: {event.focus}</p>:null;
  if(event.status!=='completed')return null;
  const legacySources=sources.map((source,index)=>({...source,citation:index+1})).filter(source=>source.kind!=='knowledge');
  return <div className="web-tool-evidence"><small className="web-evidence-caption">Подробности этого шага не сохранялись.</small>{event.name==='web_search'&&!!legacySources.length&&<><small className="web-evidence-caption">Сохранённые источники ответа</small><ol className="web-search-results">{legacySources.map(source=><Result key={source.url} legacy hit={{title:source.title||source.url,url:source.url,citation:source.citation,published_date:source.published_date}}/>)}</ol></>}</div>;
 }
 if(result.kind==='search')return <div className="web-tool-evidence">
  <small className="web-evidence-caption">Сниппеты поисковой выдачи{result.cached?' · из кеша':''}</small>
  {!!result.results?.length?<ol className="web-search-results">{result.results.map((hit,index)=><Result key={hit.url+index} hit={hit}/>)}</ol>:event.status==='completed'&&<p>Поиск не вернул результатов.</p>}
 </div>;
 const url=result.resolved_url||result.url||event.url,href=url?safeUrl(url):undefined;
 const links=(result.links||[]).filter(link=>safeUrl(link));
 return <div className="web-tool-evidence">
  {result.title&&<div className="web-page-heading">{result.citation!=null&&<span className="web-result-number">[{result.citation}] </span>}{href?<a href={href} target="_blank" rel="noopener noreferrer">{result.title}</a>:result.title}</div>}
  {result.resolved_url&&event.url&&result.resolved_url!==event.url&&<a className="web-resolved-url" href={safeUrl(result.resolved_url)} target="_blank" rel="noopener noreferrer">Открыта страница: {result.resolved_url}</a>}
  {event.focus&&<p className="web-read-focus">Что искал на странице: {event.focus}</p>}
  <small className="web-evidence-caption">Переданный модели текст{result.excerpted?' · выдержка':''}{result.cached?' · из кеша':''}{result.format==='pdf'?' · PDF':''}{result.published_date?` · ${result.published_date}`:''}</small>
  {result.content?<EvidenceText text={result.content}/>:<p>В этом шаге нового текста не передано.</p>}
  {!!links.length&&<details className="web-page-links"><summary>Ссылки на странице · {links.length}</summary><ul>{links.map((link,index)=><li key={link+index}><a href={safeUrl(link)} target="_blank" rel="noopener noreferrer">{link}</a></li>)}</ul></details>}
 </div>;
}
