export type KnowledgeSelection={enabled:boolean;collections:string[];strict:boolean};
export const knowledgeDefaults:KnowledgeSelection={enabled:false,collections:[],strict:false};
export type KnowledgeLibrary={id:string;name:string;description:string;version:number;documents?:number};
export type KnowledgeDocument={id:string;title:string;filename:string;status:string;error:string;version:number;revision:number;progress:number;chunk_count:number};
export type KnowledgeChunk={id:string;document_id:string;text:string;heading:string;page:number|null;ordinal:number;title?:string;library?:string;library_name?:string;revision?:number;score?:number};
export const knowledgeStatus=(status:string)=>({queued:'В очереди',indexing:'Обрабатывается',ready:'Готово',error:'Ошибка',interrupted:'Прервано'}[status]||status);
export function knowledgeSelection(value?:Partial<KnowledgeSelection>):KnowledgeSelection{return {...knowledgeDefaults,...value,collections:[...new Set(value?.collections||[])]}}
export function knowledgeCount(count:number,kind:'document'|'chunk'){const forms=kind==='document'?['документ','документа','документов']:['фрагмент','фрагмента','фрагментов'];return `${count} ${forms[count%100>=11&&count%100<=14?2:count%10===1?0:count%10>=2&&count%10<=4?1:2]}`}
