import {afterEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {NanoBananaControls,StudioSourceTabs} from './NanoBananaControls';
import {StudioArtMetadata} from './StudioArtMetadata';
import {TooltipProvider} from './ui/tooltip';
import {imageStudioRequestId,type ImageStudioDraft} from './useImageStudioDraft';
vi.mock('../store',()=>({failure:vi.fn(),api:vi.fn()}));
afterEach(()=>vi.unstubAllGlobals());

const draft:ImageStudioDraft={source:'aistudio',prompt:'A quiet garden',model:'aistudio/gemini-nano-banana-2.1',aspect_ratio:'auto',image_size:'1K'};

describe('Nano Banana studio presentation',()=>{
 it('creates retry identifiers on iPhone HTTP LAN without randomUUID',()=>{
  vi.stubGlobal('crypto',{getRandomValues:(bytes:Uint8Array)=>{bytes.fill(7);return bytes}});
  expect(imageStudioRequestId()).toBe('07'.repeat(16));
  vi.stubGlobal('crypto',undefined);
  expect(imageStudioRequestId()).toMatch(/^[a-f0-9]{32}$/);
 });
 it('keeps cloud controls separate from local sampler and seed fields',()=>{
  const html=renderToStaticMarkup(<NanoBananaControls draft={draft} edit={()=>{}} config={{configured:true,available:true,model:draft.model,name:'Nano Banana 2.1',aspect_ratios:['auto','1:1'],image_sizes:['1K','2K']}}/>);
  expect(html).toContain('A quiet garden');
  expect(html).toContain('Формат Nano Banana');
  expect(html).toContain('Разрешение Nano Banana');
  for(const label of ['CFG','Seed','Семплер','Шаги','LoRA','Негативный промпт'])expect(html).not.toContain(label);
 });
 it('shows the provider reason when AI Studio cannot generate',()=>{
  const html=renderToStaticMarkup(<NanoBananaControls draft={draft} edit={()=>{}} config={{configured:false,available:false,model:draft.model,name:'Nano Banana 2.1',aspect_ratios:['auto'],image_sizes:['1K'],reason:'Войдите в Google AI Studio'}}/>);
  expect(html).toContain('Войдите в Google AI Studio');
  expect(html).toContain('role="status"');
 });
 it('disables both source choices while an existing job owns the controls',()=>{
  const html=renderToStaticMarkup(<StudioSourceTabs source="aistudio" disabled onChange={()=>{}}/>);
  expect(html.match(/disabled=""/g)).toHaveLength(2);
  expect(html).toContain('aria-pressed="true"');
 });
 it('renders real cloud metadata without fictional seed or sampling steps',()=>{
  const html=renderToStaticMarkup(<TooltipProvider><StudioArtMetadata job={{id:'cloud-art',prompt:'test',model:draft.model,provider:'aistudio',status:'done',width:1024,height:1024,image_size:'1K',created:1,images:[{}]}}/></TooltipProvider>);
  expect(html).toContain('Nano Banana 2.1');
  expect(html).toContain('1K');
  expect(html).not.toContain('Seed');
  expect(html).not.toContain('шаг.');
  expect(html).not.toContain('undefined');
 });
});
