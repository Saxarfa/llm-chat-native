import type {Values} from './types';

export const modelTools=[
 {name:'generate_image',label:'Создание изображений',description:'Генерация артов через выбранную локальную модель или AI Studio.'},
 {name:'web_search',label:'Поиск в интернете',description:'Поиск актуальной информации.'},
 {name:'show_web_image',label:'Иллюстрации из интернета',description:'Картинки и схемы, найденные через Google Search в AI Studio, с сохранением в чате.'},
 {name:'fetch_url',label:'Чтение веб-страниц',description:'Открытие ссылок и чтение источников.'},
 {name:'search_knowledge',label:'Поиск в базе знаний',description:'Поиск по подключённым документам.'},
 {name:'read_knowledge',label:'Чтение документов',description:'Чтение фрагментов из базы знаний.'},
 {name:'read_chat_history',label:'Чтение истории чата',description:'Обращение к оригиналам старых сообщений.'},
 {name:'remember_chat_note',label:'Заметки чата',description:'Сохранение заметок и предложение новых.'},
 {name:'remember_memory',label:'Сохранение в память',description:'Добавление фактов и предпочтений.'},
 {name:'forget_memory',label:'Удаление из памяти',description:'Удаление сохранённых фактов по просьбе.'},
] as const;
export type ModelToolName=typeof modelTools[number]['name'];
export function modelToolDescription(tool:typeof modelTools[number],model?:string){
 if(model?.startsWith('aistudio/')){
  if(tool.name==='web_search')return 'Встроенный Google Search в AI Studio.';
  if(tool.name==='fetch_url')return 'Встроенное чтение ссылок Google URL Context в AI Studio.';
 }
 return tool.description;
}
export const toolEnabled=(config:Values,name:ModelToolName)=>config.toolCallingEnabled!==false&&config.toolPermissions?.[name]!==false;
export const allToolPermissions=(enabled:boolean)=>Object.fromEntries(modelTools.map(tool=>[tool.name,enabled]));
