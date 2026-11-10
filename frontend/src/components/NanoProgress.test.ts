import {describe,it,expect} from 'vitest';
import {nanoPhaseLabel,nanoPhaseDetail} from './NanoProgress';
import type {StudioJob} from './studioTypes';
describe('Server-backed Nano activity',()=>{
 it('distinguishes context validation, generation and local saving',()=>{
  const job={status:'generating'} as StudioJob;
  expect(nanoPhaseLabel({...job,phase:'count_tokens'})).toBe('Проверяю контекст');
  expect(nanoPhaseLabel({...job,phase:'generate_content'},true)).toBe('Ожидаю видео от AI Studio');
  expect(nanoPhaseLabel({...job,phase:'thinking'})).toBe('AI Studio: рассуждение');
  expect(nanoPhaseLabel({...job,phase:'responding'})).toBe('AI Studio: получаю текст');
  expect(nanoPhaseLabel({...job,phase:'image_received'})).toBe('Изображение получено');
  expect(nanoPhaseLabel({...job,phase:'saving'})).toBe('Сохраняю результат');
 });
 it('keeps old saved tasks readable without invented progress',()=>{
  expect(nanoPhaseLabel({status:'preparing'} as StudioJob)).toBe('Подготавливаю запрос');
  expect(nanoPhaseLabel({status:'queued'} as StudioJob)).toBe('В очереди');
 });
 it('reports missing provider details and silence without inventing a stage or failure',()=>{
  const job={status:'generating',phase:'generate_content'} as StudioJob;
  expect(nanoPhaseDetail(job)).toContain('пока не получен');
  expect(nanoPhaseDetail({...job,phase:'thinking',upstream_last_event_at:100},114000)).toBe('');
  expect(nanoPhaseDetail({...job,phase:'thinking',upstream_last_event_at:100},120000)).toContain('20 с назад');
  expect(nanoPhaseDetail({...job,phase:'saving',upstream_last_event_at:100},120000)).toBe('');
  expect(nanoPhaseLabel({status:'generating'} as StudioJob)).toBe('Ожидаю ответ AI Studio');
 });
});
