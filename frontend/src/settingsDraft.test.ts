import {afterEach,expect,it,vi} from 'vitest';
import {publicSettingsDraft,readSettingsDraft,settingsFieldError} from './settingsDraft';
afterEach(()=>vi.unstubAllGlobals());
it('never persists connection credentials or addresses in the general draft',()=>{
 expect(publicSettingsDraft({fontSize:18,apiKey:'secret',tavilyApiKey:'secret',endpoint:'https://private',searxngUrl:'https://private',searchMaxResults:7})).toEqual({fontSize:18,searchMaxResults:7});
});
it('restores only an unexpired draft with the same server baseline and account',()=>{
 let account='one';const records=new Map<string,string>();
 vi.stubGlobal('window',{storageManager:{accountKey:(key:string)=>account+':'+key}});
 vi.stubGlobal('sessionStorage',{getItem:(key:string)=>records.get(key)||null});
 records.set('one:settings-draft:name',JSON.stringify({version:1,at:Date.now(),base:JSON.stringify('saved'),value:'draft'}));
 expect(readSettingsDraft('name','saved')).toBe('draft');
 expect(readSettingsDraft('name','updated elsewhere')).toBe('updated elsewhere');
 account='two';expect(readSettingsDraft('name','saved')).toBe('saved');
 account='one';records.set('one:settings-draft:name',JSON.stringify({version:1,at:Date.now()-25*60*60*1000,base:JSON.stringify('saved'),value:'old'}));
 expect(readSettingsDraft('name','saved')).toBe('saved');
});
it('handles unavailable storage without losing the initial value',()=>{
 vi.stubGlobal('window',{storageManager:{accountKey:(key:string)=>key}});
 vi.stubGlobal('sessionStorage',{getItem:()=>{throw Error('unavailable')}});
 expect(readSettingsDraft('name','saved')).toBe('saved');
});
it('validates editable settings without blocking optional local endpoints',()=>{
 expect(settingsFieldError('endpoint','')).toBe('');
 expect(settingsFieldError('endpoint','http://127.0.0.1:8081/v1')).toBe('');
 expect(settingsFieldError('endpoint','javascript:alert(1)')).not.toBe('');
 for(const value of ['',0,11,1.5])expect(settingsFieldError('searchMaxResults',value)).not.toBe('');
 expect(settingsFieldError('searchMaxResults',5)).toBe('');
 expect(settingsFieldError('accountName','  ')).not.toBe('');
});
