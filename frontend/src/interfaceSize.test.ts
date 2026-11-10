import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const scoped=(key:string)=>`llm-account-7:${key}`;

describe('device interface size',()=>{
 let values:Map<string,string>,dataset:Record<string,string>,storage:(event:{key:string|null})=>void;
 beforeEach(()=>{
  vi.resetModules();values=new Map();dataset={};storage=()=>{};
  vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
  vi.stubGlobal('document',{documentElement:{dataset}});
  vi.stubGlobal('window',{storageManager:{accountKey:scoped},addEventListener:(_name:string,listener:typeof storage)=>{storage=listener}});
 });
 afterEach(()=>vi.unstubAllGlobals());
 it('applies a saved size before rendering and persists changes without touching reading preferences',async()=>{
  const sizes=await import('./interfaceSize');values.set(scoped(sizes.INTERFACE_SIZE_KEY),'large');values.set('saxara_chat_font','serif');
  sizes.initializeInterfaceSize();expect(dataset.uiSize).toBe('large');
  sizes.setInterfaceSize('compact');expect(dataset.uiSize).toBe('compact');expect(values.get(scoped(sizes.INTERFACE_SIZE_KEY))).toBe('compact');
  expect(values.get('saxara_chat_font')).toBe('serif');
 });
 it('syncs other tabs, ignores unrelated preferences and resets invalid or cleared values to normal',async()=>{
  const sizes=await import('./interfaceSize');values.set(scoped(sizes.INTERFACE_SIZE_KEY),'invalid');sizes.initializeInterfaceSize();expect(dataset.uiSize).toBe('normal');
  values.set(scoped(sizes.INTERFACE_SIZE_KEY),'large');storage({key:'other'});expect(dataset.uiSize).toBe('normal');
  storage({key:scoped(sizes.INTERFACE_SIZE_KEY)});expect(dataset.uiSize).toBe('large');
  values.clear();storage({key:null});expect(dataset.uiSize).toBe('normal');
 });
 it('allows resizing when browser storage is unavailable',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}});
  const sizes=await import('./interfaceSize');sizes.initializeInterfaceSize();expect(dataset.uiSize).toBe('normal');
  sizes.setInterfaceSize('large');expect(dataset.uiSize).toBe('large');
 });
});
