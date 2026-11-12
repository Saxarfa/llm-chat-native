import {expect,it} from 'vitest';
import {toolActivity} from './toolActivity';
import type {ToolEvent} from './types';
const event=(name:string,status:string):ToolEvent=>({id:name+status,name,status});
it('shows the latest running tool instead of older finished activity',()=>{
 expect(toolActivity([event('web_search','completed'),event('generate_image','running')])).toMatchObject({kind:'image',state:'running',label:'Генерация изображения'});
});
it('does not present an image failure or cancellation as a success',()=>{
 expect(toolActivity([event('generate_image','error')])).toMatchObject({state:'error',label:'Не удалось создать изображение'});
 expect(toolActivity([event('generate_image','cancelled')])).toMatchObject({state:'cancelled',label:'Генерация остановлена'});
 expect(toolActivity([event('generate_image','completed')])).toMatchObject({state:'completed',label:'Изображение создано'});
});
it('distinguishes reading sources from searching and reports mixed errors',()=>{
 expect(toolActivity([event('fetch_url','completed')])).toMatchObject({kind:'source',label:'Источник прочитан'});
 expect(toolActivity([event('web_search','completed'),event('fetch_url','error')])).toMatchObject({state:'error',label:'Поиск завершён с ошибками'});
});
it('counts search calls rather than all tool events',()=>{
 expect(toolActivity([event('web_search','completed'),event('fetch_url','completed'),{...event('web_search','completed'),id:'other'}]).meta).toBe('2 запроса');
});
it('shows a successful image retry after rejected generation attempts',()=>{
 expect(toolActivity([event('generate_image','error'),{...event('generate_image','error'),id:'retry'},event('edit_image','completed')])).toMatchObject({kind:'image',state:'completed',label:'Изображение изменено'});
 expect(toolActivity([event('edit_image','error'),event('generate_image','completed')])).toMatchObject({state:'completed',label:'Изображение создано'});
 expect(toolActivity([event('generate_image','cancelled'),event('edit_image','completed')])).toMatchObject({state:'completed',label:'Изображение изменено'});
});
it('keeps the current image retry and its failure visible despite earlier success',()=>{
 expect(toolActivity([event('generate_image','completed'),event('edit_image','running')])).toMatchObject({state:'running',label:'Редактирование изображения'});
 expect(toolActivity([event('generate_image','completed'),event('edit_image','error')])).toMatchObject({state:'error',label:'Не удалось создать изображение'});
 expect(toolActivity([event('generate_image','cancelled'),event('edit_image','error')])).toMatchObject({state:'error'});
});
it('distinguishes memory updates from searches and skipped writes',()=>{
 expect(toolActivity([event('remember_memory','running')])).toMatchObject({kind:'memory',label:'Сохранение в память'});
 expect(toolActivity([{...event('remember_memory','completed'),result_count:1}])).toMatchObject({label:'Память обновлена'});
 expect(toolActivity([{...event('remember_memory','completed'),result_count:0}])).toMatchObject({label:'Память проверена'});
});
