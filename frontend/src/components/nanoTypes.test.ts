import {describe,it,expect} from 'vitest';
import {mergeNanoText,nanoDefaults,nanoFailure,nanoPath,nanoPending,nanoModelSettings,nanoRequestError,nanoTextOnly,nanoVideoDurationDraft,type NanoMessage,type NanoPart} from './nanoTypes';
const message=(id:string,parent_id:string|null,role:'user'|'model')=>({id,parent_id,role,text:id,content:[],job:{id,status:'done',images:[]}} as unknown as NanoMessage);
describe('Nano conversation graph',()=>{
 it('keeps video duration edits visible without losing text or accumulating generated instructions',()=>{
  const first=nanoVideoDurationDraft('Сделай небо синим',7);
  expect(first.text).toBe('Сделай небо синим\n\nЖелаемая длительность видео: 7 с.');
  const second=nanoVideoDurationDraft(first.text+'\nБез музыки',4,first.instruction);
  expect(second.text).toBe('Сделай небо синим\n\nЖелаемая длительность видео: 4 с.\nБез музыки');
  expect(nanoVideoDurationDraft(first.text,10).text).toBe('Сделай небо синим\n\nЖелаемая длительность видео: 10 с.');
  expect(nanoVideoDurationDraft('',3).text).toBe('Желаемая длительность видео: 3 с.');
  expect(nanoVideoDurationDraft('Моя собственная инструкция',7,first.instruction).text).toBe('Моя собственная инструкция\n\nЖелаемая длительность видео: 7 с.');
 });
 it('distinguishes completed text-only replies from images, video, users and unfinished jobs',()=>{
  const reply={...message('m','u','model'),text:'A description without the image',job:{...message('m','u','model').job,model:nanoDefaults.model}};
  expect(nanoTextOnly(reply)).toBe(true);
  expect(nanoTextOnly({...reply,role:'user'})).toBe(false);
  expect(nanoTextOnly({...reply,job:{...reply.job,status:'generating'}})).toBe(false);
  expect(nanoTextOnly({...reply,content:[{type:'image',id:'art',index:0,kind:'image'}]})).toBe(false);
  expect(nanoTextOnly({...reply,content:[{type:'video',id:'clip',index:0,kind:'nano_video'}]})).toBe(false);
  expect(nanoTextOnly({...reply,job:{...reply.job,model:'aistudio/gemini-omni-1.1-flash'}})).toBe(false);
  expect(nanoTextOnly({...reply,text:'',content:[]})).toBe(false);
 });
 it('adapts settings when selecting a different model without losing the instruction',()=>{
  const settings=nanoModelSettings({...nanoDefaults,image_size:'4K',aspect_ratio:'8:1',thinking:'high',max_output_tokens:65536,system_instruction:'Keep style'},
   {configured:true,available:true,model:'aistudio/gemini-3-pro-image',name:'Pro',aspect_ratios:['auto','1:1'],image_sizes:['1K','2K'],output_limit:32768,features:{google_search:true,image_search:false,thinking_level:false}});
  expect(settings).toMatchObject({model:'aistudio/gemini-3-pro-image',image_size:'1K',aspect_ratio:'auto',thinking:'default',google_search:true,image_search:false,max_output_tokens:32768,system_instruction:'Keep style'});
  expect(nanoDefaults.image_search).toBe(true);
 });
 it('localizes browser network failures while preserving server validation messages',()=>{
  for(const text of ['Failed to fetch','Load failed','NetworkError when attempting to fetch resource.'])expect(nanoRequestError(new TypeError(text))).toContain('Связь с сервером прервалась');
  expect(nanoRequestError(new Error('Чат изменён в другой вкладке'))).toBe('Чат изменён в другой вкладке');
 });
 it('explains timeouts by phase, including errors saved by older clients',()=>{
  const job={...message('u',null,'user').job,error_code:'response_timeout',error:'AI Studio перестала передавать ответ.'};
  expect(nanoFailure(job).detail).toContain('Текст и вложения сохранены');
  expect(nanoFailure({...job,error_code:'504',error_phase:'count_tokens'}).detail).toContain('Генерация ещё не началась');
  expect(nanoFailure({...job,error_code:'image_context_limit'}).title).toBe('Цепочка достигла лимита');
  expect(nanoFailure({...job,error_code:'429',error:'Quota'}).title).toBe('Достигнут лимит Google');
  expect(nanoFailure({...job,error_code:'401'}).detail).toContain('Черновик сохранён');
  expect(nanoFailure({...job,error_code:'403'}).title).toBe('Google отклонил доступ');
 });
 it('preserves a text clarification and follows the selected branch',()=>{
  const rows=[message('u1',null,'user'),message('m1','u1','model'),message('u2','m1','user'),message('clarification','u2','model'),message('branch','m1','user'),message('alternate','branch','model')];
  expect(nanoPath(rows,'clarification').map(m=>m.id)).toEqual(['u1','m1','u2','clarification']);
  expect(nanoPath(rows,'alternate').map(m=>m.id)).toEqual(['u1','m1','branch','alternate']);
  expect(rows).toHaveLength(6);
 });
 it('bounds corrupt cycles and handles an empty conversation',()=>{expect(nanoPath([],null)).toEqual([]);expect(nanoPath([message('loop','loop','model')],'loop')).toHaveLength(1)});
 it('joins adjacent text without changing spacing or crossing an image',()=>{
  const parts:NanoPart[]=[{type:'text',text:'First '},{type:'text',text:'sentence.\n\nNext.'},{type:'image',id:'art',kind:'image',index:0},{type:'text',text:'After '},{type:'text',text:'image.'}];
  expect(mergeNanoText(parts)).toEqual([{type:'text',text:'First sentence.\n\nNext.'},parts[2],{type:'text',text:'After image.'}]);
  expect(parts[0]).toEqual({type:'text',text:'First '});
 });
 it('defaults to 1K, automatic ratio and both search types',()=>{expect(nanoDefaults).toMatchObject({aspect_ratio:'auto',image_size:'1K',google_search:true,image_search:true,response_mode:'text_image',thinking:'default'});expect(nanoPending(null)).toBe(false);expect(nanoPending({status:'generating'} as never)).toBe(true);expect(nanoPending({status:'cancelled'} as never)).toBe(false)});
});
