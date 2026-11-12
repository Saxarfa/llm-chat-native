import {afterEach,expect,it,vi} from 'vitest';
import {createDraftWriter} from './composerDraft';

afterEach(()=>vi.useRealTimers());
const draft=(text:string)=>({text,attachments:[{name:'image.jpg',dataUrl:'data:image/jpeg;base64,'+'x'.repeat(1000000)}],pastedTexts:[]});

it('coalesces rapid typing with large attachments into one latest write',()=>{
 vi.useFakeTimers();const storage={setItem:vi.fn(),removeItem:vi.fn()},writer=createDraftWriter('draft-a',()=>storage);
 for(let i=0;i<100;i++)writer.update(draft(String(i)));
 expect(storage.setItem).not.toHaveBeenCalled();vi.advanceTimersByTime(180);
 expect(storage.setItem).toHaveBeenCalledTimes(1);
 expect(JSON.parse(storage.setItem.mock.calls[0][1]).text).toBe('99');
});
it('persists during continuous typing and flushes before leaving the page',()=>{
 vi.useFakeTimers();const storage={setItem:vi.fn(),removeItem:vi.fn()},writer=createDraftWriter('draft-a',()=>storage);
 for(let i=0;i<12;i++){writer.update(draft(String(i)));vi.advanceTimersByTime(100)}
 expect(storage.setItem).toHaveBeenCalledTimes(1);writer.flush();
 expect(JSON.parse(storage.setItem.mock.calls.at(-1)![1]).text).toBe('11');
 vi.runAllTimers();expect(storage.setItem).toHaveBeenCalledTimes(2);
});
it('keeps pending saves scoped to their conversation and never restores a sent draft',()=>{
 vi.useFakeTimers();const storage={setItem:vi.fn(),removeItem:vi.fn()},a=createDraftWriter('a',()=>storage),b=createDraftWriter('b',()=>storage);
 a.update(draft('first'));a.flush();b.update(draft('second'));b.clear();vi.runAllTimers();
 expect(storage.setItem).toHaveBeenCalledTimes(1);expect(storage.setItem.mock.calls[0][0]).toBe('a');
 expect(storage.removeItem).toHaveBeenCalledWith('b');
});
it('survives quota/access failures and retries the latest pending draft',()=>{
 vi.useFakeTimers();const storage={setItem:vi.fn().mockImplementationOnce(()=>{throw new DOMException('Full','QuotaExceededError')}),removeItem:vi.fn(()=>{throw new Error('Unavailable')})},writer=createDraftWriter('a',()=>storage);
 writer.update(draft('saved later'));expect(()=>vi.runAllTimers()).not.toThrow();writer.flush();
 expect(storage.setItem).toHaveBeenCalledTimes(2);expect(()=>writer.clear()).not.toThrow();
});

it('keeps file bytes in IndexedDB and only writes a small reference while typing',async()=>{
 const storage={setItem:vi.fn(),removeItem:vi.fn()},files={put:vi.fn(async()=> 'stored'),get:vi.fn(async()=>undefined),remove:vi.fn(async()=>undefined)};
 const writer=createDraftWriter('account-a:branch-a',()=>storage,180,files),value=draft('first');
 writer.update(value);await writer.flush();writer.update({...value,text:'second'});await writer.flush();
 expect(files.put).toHaveBeenCalledTimes(1);expect(storage.setItem.mock.calls.every(call=>call[1].length<300)).toBe(true);
 expect(JSON.parse(storage.setItem.mock.calls.at(-1)![1])).toMatchObject({text:'second',attachments:[],fileKey:expect.any(String)});
});

it('serializes file removal and sending after pending file writes',async()=>{
 const data=new Map<string,string>(),storage={setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)};
 let commit!:()=>void;
 const files={put:vi.fn(()=>new Promise<string>(resolve=>{commit=()=>resolve('saved')})),get:vi.fn(async()=>undefined),remove:vi.fn(async()=>undefined)};
 const writer=createDraftWriter('a',()=>storage,180,files);
 writer.update(draft('pending'));void writer.flush();await Promise.resolve();await Promise.resolve();
 const cleared=writer.clear();commit();await cleared;
 expect(data.has('a')).toBe(false);expect(files.remove).toHaveBeenCalledTimes(1);
 writer.update({text:'only text',attachments:[],pastedTexts:[]});await writer.flush();
 expect(JSON.parse(data.get('a')!).text).toBe('only text');
});

it('keeps a restoring file reference when typing or leaving before its bytes load',async()=>{
 const storage={setItem:vi.fn(),removeItem:vi.fn()},files={put:vi.fn(async()=> 'stored'),get:vi.fn(async()=>undefined),remove:vi.fn(async()=>undefined)};
 const writer=createDraftWriter('a',()=>storage,180,files);writer.restoring('existing-file');
 writer.update({text:'typed while restoring',attachments:[],pastedTexts:[]});await writer.flush();
 expect(JSON.parse(storage.setItem.mock.calls.at(-1)![1])).toMatchObject({fileKey:'existing-file',text:'typed while restoring'});
 const value=draft('loaded');writer.restored('existing-file',value.attachments);writer.update(value);await writer.flush();
 expect(files.put).not.toHaveBeenCalled();expect(files.remove).not.toHaveBeenCalled();
});

it('retries an initial file write before publishing a queued newer text save',async()=>{
 const storage={setItem:vi.fn(),removeItem:vi.fn()},files={put:vi.fn().mockRejectedValueOnce(new Error('Transient storage failure')).mockResolvedValue('stored'),get:vi.fn(async()=>undefined),remove:vi.fn(async()=>undefined)};
 const writer=createDraftWriter('a',()=>storage,180,files),value=draft('first');
 writer.update(value);void writer.flush();writer.update({...value,text:'newer'});await writer.flush();
 expect(files.put).toHaveBeenCalledTimes(2);
 expect(JSON.parse(storage.setItem.mock.calls.at(-1)![1]).text).toBe('newer');
 const count=storage.setItem.mock.calls.length;await writer.flush();expect(storage.setItem).toHaveBeenCalledTimes(count);
});
