import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {NanoStudio} from './NanoStudio';
import {TooltipProvider} from './ui/tooltip';

vi.mock('../store', () => ({
 failure: vi.fn(),
 api: vi.fn().mockResolvedValue({jobs: [], sessions: []})
}));

vi.mock('./useNanoChat', () => ({
 useNanoChat: vi.fn(() => ({
  sessions: [
   {id: 's1', title: 'Солнечная комната', created: 1000, updated: 1000, root_job_id: '', head_id: 'm2', revision: 2, settings: {model: 'aistudio/gemini-nano-banana-2.1', aspect_ratio: '16:9', image_size: '4K', response_mode: 'text_image', thinking: 'default', google_search: true, image_search: true, system_instruction: '', max_output_tokens: null, stop_sequences: []}}
  ],
  view: {
   session: {id: 's1', title: 'Солнечная комната', created: 1000, updated: 1000, root_job_id: '', head_id: 'm2', revision: 2, settings: {model: 'aistudio/gemini-nano-banana-2.1', aspect_ratio: '16:9', image_size: '4K', response_mode: 'text_image', thinking: 'default', google_search: true, image_search: true, system_instruction: '', max_output_tokens: null, stop_sequences: []}},
   root_job: null,
   messages: [
    {id: 'u1', parent_id: null, role: 'user', text: 'Персонаж в комнате', job: {id: 'j1', status: 'done', model: 'aistudio/gemini-nano-banana-2.1', images: ['img1.png'], prompt: 'Персонаж в комнате'}, content: [{type: 'text', text: 'Персонаж в комнате'}]},
    {id: 'm1', parent_id: 'u1', role: 'model', text: 'Первая версия создана', job: {id: 'j1', status: 'done', model: 'aistudio/gemini-nano-banana-2.1', images: ['img1.png'], prompt: 'Персонаж в комнате', aspect_ratio: '16:9', image_size: '4K', created: 1001}, content: [{type: 'image', id: 'img1', index: 0, kind: 'image'}, {type: 'text', text: 'Первая версия создана'}]},
    {id: 'u2', parent_id: 'm1', role: 'user', text: 'Сделай фон в стиле персонажа', job: {id: 'j2', status: 'done', model: 'aistudio/gemini-nano-banana-2.1', images: ['img2.png'], prompt: 'Сделай фон в стиле персонажа'}, content: [{type: 'text', text: 'Сделай фон в стиле персонажа'}]},
    {id: 'm2', parent_id: 'u2', role: 'model', text: 'Фон и персонаж в одном стиле', job: {id: 'j2', status: 'done', model: 'aistudio/gemini-nano-banana-2.1', images: ['img2.png'], prompt: 'Сделай фон в стиле персонажа', aspect_ratio: '16:9', image_size: '4K', created: 1002}, content: [{type: 'image', id: 'img2', index: 0, kind: 'image'}, {type: 'text', text: 'Фон и персонаж в одном стиле'}]}
   ],
   active_job: null
  },
  config: {
   configured: true,
   available: true,
   model: 'aistudio/gemini-nano-banana-2.1',
   name: 'Nano Banana 2.1',
   aspect_ratios: ['auto', '16:9', '1:1', '9:16', '4:3'],
   image_sizes: ['1K', '2K', '4K'],
   features: {google_search: true, image_search: true, thinking_level: true}
  },
  models: [
   {model: 'aistudio/gemini-nano-banana-2.1', name: 'Nano Banana 2.1', available: true, aspect_ratios: ['auto', '16:9', '1:1', '9:16', '4:3'], image_sizes: ['1K', '2K', '4K']}
  ],
  loading: false,
  busy: false,
  uploads: [],
  error: '',
  uncertain: false,
  draft: {text: '', assets: []},
  setDraft: vi.fn(),
  accepted: 0,
  settings: {model: 'aistudio/gemini-nano-banana-2.1', aspect_ratio: '16:9', image_size: '4K', response_mode: 'text_image', thinking: 'default', google_search: true, image_search: true, system_instruction: '', max_output_tokens: null, stop_sequences: []},
  options: vi.fn(),
  saveDefaults: vi.fn(),
  chooseModel: vi.fn(),
  dismissError: vi.fn(),
  select: vi.fn(),
  create: vi.fn(),
  patch: vi.fn(),
  send: vi.fn(),
  upload: vi.fn(),
  gallery: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  stop: vi.fn(),
  refresh: vi.fn()
 }))
}));

beforeEach(() => {
 vi.stubGlobal('window', {
  storageManager: {
   getAuthHeaders: () => ({'Authorization': 'Bearer test-token'})
  },
  dispatchEvent: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  matchMedia: vi.fn().mockReturnValue({matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn()})
 });
 vi.stubGlobal('document', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
 });
});

afterEach(() => {
 vi.unstubAllGlobals();
});

const render = (node: React.ReactNode) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);


describe('Nano Banana conversation',()=>{
 const screen=()=>render(<NanoStudio userId="user1" active={true} onMenu={()=>{}} onChat={()=>{}} showMenuButton={false}/>);
 it('shows the conversation and current model without the old canvas UI',()=>{
  const html=screen();
  expect(html).toContain('Солнечная комната');
  expect(html).toContain('Nano Banana 2.1');
  expect(html).toContain('Персонаж в комнате');
  expect(html).toContain('Фон и персонаж в одном стиле');
  expect(html).not.toContain('Холст');
  expect(html).not.toContain('Лента');
  expect(html).not.toContain('nano-versions-strip');
  expect(html).not.toContain('Создать версию');
 });
 it('renders one editor and explicit continuation actions for each answer',()=>{
  const html=screen();
  expect(html.match(/class="chat-composer-editor"/g)).toHaveLength(1);
  expect(html.match(/Продолжить отсюда/g)).toHaveLength(2);
  expect(html).toContain('Добавить изображения');
  expect(html).toContain('Отправить Nano Banana');
  expect(html).toContain('Параметры Nano Banana');
  expect(html).not.toContain('Редактируется');
  expect(html).not.toContain('Показать описание');
 });
 it('keeps image and text order in an answer',()=>{
  const html=screen();
  const start=html.indexOf('data-message-id="m1"'),end=html.indexOf('data-message-id="u2"');
  const answer=html.slice(start,end);
  expect(answer.indexOf('nano-image')).toBeLessThan(answer.indexOf('Первая версия создана'));
  expect(answer).not.toContain('is-collapsed');
 });
});
