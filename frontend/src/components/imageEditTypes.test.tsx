import {describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {imageEditPath,imageEditVersions,latestImageEditParent,type ImageEditView,type ImageEditMessage} from './imageEditTypes';
import {ImageEditMessages} from './ImageEditChat';
import type {StudioJob} from './studioTypes';
vi.mock('../store',()=>({api:vi.fn(),failure:vi.fn()}));
const job=(id:string,images:unknown[]=[{}]):StudioJob=>({id,prompt:'Synthetic',width:512,height:512,created:1,status:'done',images});
const messages:ImageEditMessage[]=[
 {id:'u1',parent_id:null,role:'user',text:'Make the cup blue',created:1,job:job('one')},
 {id:'m1',parent_id:'u1',role:'model',text:'Blue cup',created:2,job:job('one')},
 {id:'u2',parent_id:'m1',role:'user',text:'Explain the lighting',created:3,job:job('text',[])},
 {id:'m2',parent_id:'u2',role:'model',text:'Soft light from the left',created:4,job:job('text',[])},
 {id:'u3',parent_id:'m2',role:'user',text:'Add a shadow',created:5,job:job('two')},
 {id:'m3',parent_id:'u3',role:'model',text:'Added',created:6,job:job('two')},
 {id:'branch-user',parent_id:'m1',role:'user',text:'Different branch',created:7,job:job('branch')},
 {id:'branch-model',parent_id:'branch-user',role:'model',text:'Branch result',created:8,job:job('branch')},
];
const view:ImageEditView={session:{id:'session',root_job_id:'root',model:'aistudio/gemini-nano-banana-2.1',created:1},root_job:job('root'),messages,active_job:null};
describe('image editing conversation graph',()=>{
 it('preserves text-only context and excludes another branch',()=>{
  expect(imageEditPath(messages,'m3').map(message=>message.id)).toEqual(['u1','m1','u2','m2','u3','m3']);
  expect(imageEditPath(messages,'branch-model').map(message=>message.id)).toEqual(['u1','m1','branch-user','branch-model']);
 });
 it('lists image versions without inventing an image for a text-only answer',()=>{
  expect(imageEditVersions(view).map(version=>version.job.id)).toEqual(['root','one','two','branch']);
  expect(latestImageEditParent({...view,messages:messages.slice(0,4)})).toBe('m2');
 });
 it('uses the initial Nano generation turn as the original without a duplicate version',()=>{
  const generated:ImageEditView={...view,messages:[{id:'initial-user',parent_id:null,role:'user',text:'Generate original',created:0,job:job('root')},{id:'initial-model',parent_id:'initial-user',role:'model',text:'Original ready',created:1,job:job('root')},{...messages[0],parent_id:'initial-model'},messages[1]]};
  expect(imageEditVersions(generated).map(version=>[version.message_id,version.job.id,version.label])).toEqual([['initial-model','root','Исходник'],['m1','one','Версия 1']]);
  expect(imageEditPath(generated.messages,'initial-model').map(message=>message.id)).toEqual(['initial-user','initial-model']);
 });
 it('does not loop forever on damaged imported graph references',()=>{
  expect(imageEditPath([{...messages[0],parent_id:'u1'}],'u1')).toHaveLength(1);
  expect(imageEditPath(messages,'missing')).toEqual([]);
 });
 it('renders text-only model replies as text and escapes source content',()=>{
  const html=renderToStaticMarkup(<ImageEditMessages messages={[{...messages[3],text:'<script>unsafe()</script>'}]} versions={new Map()} onVersion={()=>{}}/>);
  expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('image-edit-version-link');
 });
 it('keeps failed and cancelled user attempts visible without fake model replies',()=>{
  const html=renderToStaticMarkup(<ImageEditMessages messages={[{...messages[0],job:{...job('failed'),status:'error',error:'Сервис недоступен'}},{...messages[0],id:'cancelled',job:{...job('cancelled'),status:'cancelled'}}]} versions={new Map()} onVersion={()=>{}}/>);
  expect(html).toContain('Сервис недоступен');expect(html).toContain('Остановлено');expect(html).not.toContain('is-model');
 });
});
