import {afterEach,describe,expect,it,vi} from 'vitest';
import {observeConversationVisibility} from './conversationVisibility';

afterEach(()=>vi.unstubAllGlobals());

function setup(){
 let update!:IntersectionObserverCallback,changed!:MutationCallback;
 const observe=vi.fn(),disconnect=vi.fn(),unobserve=vi.fn(),rows=[row('a'),row('b')];
 const root={querySelectorAll:vi.fn(()=>rows),getBoundingClientRect:vi.fn(()=>{throw new Error('Synchronous layout during scroll')})} as unknown as HTMLElement;
 vi.stubGlobal('IntersectionObserver',class{
  constructor(callback:IntersectionObserverCallback,options:IntersectionObserverInit){update=callback;expect(options.root).toBe(root)}
  observe=observe;disconnect=disconnect;unobserve=unobserve;
 });
 vi.stubGlobal('MutationObserver',class{constructor(callback:MutationCallback){changed=callback}observe=vi.fn();disconnect=vi.fn()});
 const onChange=vi.fn();
 const cleanup=observeConversationVisibility(root,onChange);
 const deliver=(...entries:Partial<IntersectionObserverEntry>[])=>update(entries as IntersectionObserverEntry[],{} as IntersectionObserver);
 const entry=(id:string,visible:boolean)=>({target:rows.find(item=>item.dataset.messageId===id)||row(id),isIntersecting:visible});
 return{root,onChange,cleanup,deliver,observe,disconnect,rows,unobserve,entry,changed:()=>changed([],{} as MutationObserver)};
}
function row(id:string){return{dataset:{messageId:id},getBoundingClientRect:()=>{throw new Error('Message layout read')}} as unknown as HTMLElement}

describe('conversation map visibility',()=>{
 it('observes messages once and updates only changed visibility without layout scans',()=>{
  const {root,observe,deliver,onChange,entry}=setup();
  expect(observe).toHaveBeenCalledTimes(2);
  deliver(entry('a',true),entry('b',false));
  expect(onChange).toHaveBeenLastCalledWith(new Set(['a']));
  for(let i=0;i<100;i++)deliver(entry('a',true),entry('b',false));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(root.querySelectorAll).toHaveBeenCalledTimes(1);
  expect(root.getBoundingClientRect).not.toHaveBeenCalled();
 });
 it('handles upward scrolling as a single visibility update and keeps prior snapshots immutable',()=>{
  const {deliver,onChange,entry}=setup();
  deliver(entry('b',true));
  const previous=onChange.mock.calls[0][0];
  deliver(entry('a',true),entry('b',false));
  expect(onChange).toHaveBeenCalledTimes(2);
  expect(onChange).toHaveBeenLastCalledWith(new Set(['a']));
  expect(previous).toEqual(new Set(['b']));
 });
 it('ignores rows without ids and disconnects when the conversation changes',()=>{
  const {deliver,onChange,cleanup,disconnect}=setup();
  deliver({target:row(''),isIntersecting:true});
  expect(onChange).not.toHaveBeenCalled();
  cleanup();
  expect(disconnect).toHaveBeenCalledOnce();
 });
 it('tracks prepared older rows and releases removed rows without re-observing history',()=>{
  const {rows,observe,unobserve,changed,deliver,onChange,entry}=setup();
  const oldest=row('old');rows.unshift(oldest);changed();
  expect(observe).toHaveBeenCalledTimes(3);
  deliver(entry('old',true));expect(onChange).toHaveBeenLastCalledWith(new Set(['old']));
  rows.shift();changed();expect(unobserve).toHaveBeenCalledWith(oldest);
  expect(onChange).toHaveBeenLastCalledWith(new Set());
  const count=onChange.mock.calls.length;
  deliver({target:oldest,isIntersecting:true});
  expect(onChange).toHaveBeenCalledTimes(count);
 });
});
