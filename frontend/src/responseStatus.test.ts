import {expect,it} from 'vitest';
import {responseOutcome,responseStatus} from './responseStatus';
import type {Live,Message,ToolEvent} from './types';
const message:Message={id:'answer',role:'assistant',content:'',timestamp:0};
const live:Live={chat_id:'chat'};
const tool=(name:string,status='running'):ToolEvent=>({id:name,name,status});

it('does not spin a finished search or page read while waiting for the next answer',()=>{
 for(const [name,phase] of [['web_search','Поиск завершён'],['fetch_url','Источник прочитан'],['search_knowledge','База знаний проверена']]){
  const status=responseStatus({...message,tool_events:[tool(name,'completed')]},{...live,phase});
  expect(status?.phase).toMatchObject({state:'running',label:'Подготовка ответа…'});
  expect(status?.current.label).not.toBe(phase);
 }
 expect(responseStatus(message,{...live,phase:'Источники Google Search получены'})?.phase?.state).toBe('completed');
});

it('keeps failed tool details separate from a model response that can still recover',()=>{
 const status=responseStatus({...message,tool_events:[{...tool('web_search','error'),error:'Search unavailable'}]},{...live,phase:'Ошибка инструмента: Search unavailable'});
 expect(status?.current.label).toBe('Подготовка ответа…');
 expect(responseOutcome({...message,content:'Answer using available information.'}).reason).toBe('completed');
});

it('gives stopping priority over reasoning, image generation and tools',()=>{
 const variants=[{...message,reasoning:'Partial reasoning'},{...message,tool_events:[tool('web_search')]},{...message,generated_images:[{id:'image',status:'generating',width:512,height:512,image_count:0,prompt:''}]}];
 for(const current of variants){
  const status=responseStatus(current,{...live,is_thinking:true,stopping:true});
  expect(status?.thinking).toBe(false);
  expect(status?.phase).toMatchObject({kind:'stopping',label:'Сохраняем частичный ответ…'});
 }
});

it('uses one current tool instead of a stale preparation phase and previous tool outcomes',()=>{
 const status=responseStatus({...message,tool_events:[tool('web_search','completed'),tool('fetch_url')]},{...live,phase:'Поиск завершён'});
 expect(status?.phase).toBeNull();expect(status?.current).toMatchObject({kind:'source',label:'Чтение источника'});
 const image=responseStatus({...message,tool_events:[tool('edit_image')]},live);
 expect(image?.current.label).toBe('Изменение изображения');
});

it('keeps real processing phases after text and gives an image without tool events a status',()=>{
 const writing={...message,content:'Partial answer'};
 expect(responseStatus(writing,{...live,phase:'Генерация ответа…'})?.phase).toBeNull();
 expect(responseStatus(writing,{...live,phase:'Проверка языка ответа…'})?.phase?.label).toBe('Проверка языка ответа…');
 expect(responseStatus(message,{...live,phase:'Освобождение видеопамяти…'})?.current.label).toBe('Подготовка запроса…');
 expect(responseStatus(message,{...live,phase:'Освобождение памяти ComfyUI…'})?.current.label).toBe('Освобождение памяти ComfyUI…');
 expect(responseStatus({...message,generated_images:[{id:'image',status:'queued',width:512,height:512,image_count:0,prompt:''}]},live)?.phase?.label).toBe('Подготовка изображения…');
 expect(responseStatus(message)).toBeNull();
});

it('reports errors, remote cancellation and length limits instead of success',()=>{
 expect(responseOutcome({...message,metrics:{error:'Provider unavailable',stopped:true}},true)).toMatchObject({reason:'error',label:'Не удалось завершить ответ'});
 expect(responseOutcome({...message,metrics:{stopped:true}}).reason).toBe('stopped');
 expect(responseOutcome({...message,metrics:{finishReason:'length'}})).toMatchObject({reason:'length',label:'Достигнут лимит ответа'});
 expect(responseOutcome(message,true).reason).toBe('stopped');
 expect(responseOutcome({...message,metrics:{stopped:false}},true).reason).toBe('completed');
});

it('does not announce success for an image-only failure and accepts a successful retry',()=>{
 const image={id:'image',width:512,height:512,image_count:0,prompt:'',status:'error'};
 expect(responseOutcome({...message,generated_images:[image]})).toMatchObject({reason:'error',label:'Не удалось создать изображение'});
 expect(responseOutcome({...message,generated_images:[{...image,status:'cancelled'}]}).reason).toBe('stopped');
 expect(responseOutcome({...message,generated_images:[image,{...image,id:'retry',status:'done'}]}).reason).toBe('completed');
 expect(responseOutcome({...message,content:'The tool failed; here is another way.',generated_images:[image]}).reason).toBe('completed');
});
