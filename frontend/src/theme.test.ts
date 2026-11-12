import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const scoped=(key:string)=>`llm-account-7:${key}`;

describe('theme preferences',()=>{
 let values:Map<string,string>,root:{dataset:Record<string,string>;style:Record<string,string>};
 let events:Record<string,(event:{key:string|null})=>void>,osChanged:()=>void;
 let media:{matches:boolean;addEventListener:(name:string,listener:()=>void)=>void};
 let metas:Map<string,string>;
 beforeEach(()=>{
  vi.resetModules();vi.useFakeTimers();values=new Map();metas=new Map();events={};osChanged=()=>{};
  root={dataset:{},style:{}};
  media={matches:true,addEventListener:(_name,listener)=>{osChanged=listener}};
  vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
  vi.stubGlobal('window',{storageManager:{accountKey:scoped},matchMedia:()=>media,addEventListener:(name:string,listener:typeof events[string])=>{events[name]=listener}});
  vi.stubGlobal('document',{documentElement:root,querySelector:(selector:string)=>({setAttribute:(_name:string,value:string)=>metas.set(selector,value),set content(value:string){metas.set(selector,value)}})});
 });
 afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()});

 it('keeps dark as the default and applies a saved light preference before rendering',async()=>{
  const theme=await import('./theme');values.set(scoped(theme.THEME_STORAGE_KEY),'light');theme.initializeTheme();
  expect(root.dataset.theme).toBe('light');expect(root.style.colorScheme).toBe('light');
  expect(metas.get('meta[name="theme-color"]')).toBe('#f7f5f0');
  expect(theme.validThemeMode('unknown')).toBe('dark');
 });
 it('follows OS changes only when system mode is selected',async()=>{
  const theme=await import('./theme');theme.setThemeMode('system');expect(root.dataset.theme).toBe('dark');
  media.matches=false;osChanged();expect(root.dataset.theme).toBe('light');
  theme.setThemeMode('dark');osChanged();expect(root.dataset.theme).toBe('dark');
  expect(values.get(scoped(theme.THEME_STORAGE_KEY))).toBe('dark');
 });
 it('syncs another tab and handles clearing the saved preference',async()=>{
  const theme=await import('./theme');theme.initializeTheme();values.set(scoped(theme.THEME_STORAGE_KEY),'light');
  events.storage({key:scoped(theme.THEME_STORAGE_KEY)});expect(root.dataset.theme).toBe('light');
  values.clear();events.storage({key:null});expect(root.dataset.theme).toBe('dark');
 });
 it('still switches if browser storage is unavailable',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('blocked')},setItem:()=>{throw new Error('blocked')}});
  const theme=await import('./theme');theme.initializeTheme();expect(root.dataset.theme).toBe('dark');
  theme.setThemeMode('light');expect(root.dataset.theme).toBe('light');
 });
 it('starts a new account with its own theme and restores the owner preference',async()=>{
  const theme=await import('./theme');theme.initializeTheme();theme.setThemeMode('light');
  window.storageManager.accountKey=(key:string)=>`llm-account-8:${key}`;
  events['account-changed']({key:null});expect(root.dataset.theme).toBe('dark');
  theme.setThemeMode('system');expect(values.get(scoped(theme.THEME_STORAGE_KEY))).toBe('light');
  window.storageManager.accountKey=scoped;events['account-changed']({key:null});expect(root.dataset.theme).toBe('light');
 });
 it('ends the color transition without overriding later switches',async()=>{
  const theme=await import('./theme');theme.initializeTheme();theme.setThemeMode('light');
  expect(root.dataset.themeChanging).toBe('true');vi.advanceTimersByTime(120);theme.setThemeMode('dark');
  vi.advanceTimersByTime(120);expect(root.dataset.themeChanging).toBe('true');
  vi.advanceTimersByTime(120);expect(root.dataset.themeChanging).toBeUndefined();expect(root.dataset.theme).toBe('dark');
 });
 it('restores saved OLED with dark native controls and black browser chrome',async()=>{
  const theme=await import('./theme');values.set(scoped(theme.THEME_STORAGE_KEY),'oled');theme.initializeTheme();
  expect(theme.validThemeMode('oled')).toBe('oled');
  expect(root.dataset.theme).toBe('oled');expect(root.style.colorScheme).toBe('dark');
  expect(metas.get('meta[name="theme-color"]')).toBe('#000000');
  expect(metas.get('meta[name="apple-mobile-web-app-status-bar-style"]')).toBe('black');
  media.matches=false;osChanged();expect(root.dataset.theme).toBe('oled');
 });
 it('persists OLED across tabs without changing system theme resolution',async()=>{
  const theme=await import('./theme');theme.setThemeMode('oled');
  expect(values.get(scoped(theme.THEME_STORAGE_KEY))).toBe('oled');
  values.set(scoped(theme.THEME_STORAGE_KEY),'light');events.storage({key:scoped(theme.THEME_STORAGE_KEY)});
  expect(root.dataset.theme).toBe('light');
  values.set(scoped(theme.THEME_STORAGE_KEY),'oled');events.storage({key:scoped(theme.THEME_STORAGE_KEY)});
  expect(root.dataset.theme).toBe('oled');expect(root.style.colorScheme).toBe('dark');
  theme.setThemeMode('system');expect(root.dataset.theme).toBe('dark');media.matches=false;osChanged();expect(root.dataset.theme).toBe('light');
 });
 it('isolates OLED from another account preference',async()=>{
  const theme=await import('./theme');theme.setThemeMode('oled');
  window.storageManager.accountKey=(key:string)=>`llm-account-8:${key}`;
  events['account-changed']({key:null});expect(root.dataset.theme).toBe('dark');
  window.storageManager.accountKey=scoped;events['account-changed']({key:null});expect(root.dataset.theme).toBe('oled');
 });
 it('applies account-scoped OLED before the application bundle loads',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const bootstrap=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];expect(bootstrap).toBeTruthy();
  values.set('llamachat_auth_user',JSON.stringify({id:7}));values.set(scoped('saxara_chat_theme'),'oled');
  runInNewContext(bootstrap!,{localStorage,document,matchMedia:()=>({matches:false})});
  expect(root.dataset.theme).toBe('oled');expect(root.style.colorScheme).toBe('dark');
  expect(metas.get('meta[name="theme-color"]')).toBe('#000000');
 });

});
