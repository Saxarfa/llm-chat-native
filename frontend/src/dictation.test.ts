import {afterEach,describe,expect,it,vi} from 'vitest';
import {appendDictation,DictationCapture,recordingMime} from './dictation';

afterEach(()=>vi.unstubAllGlobals());
describe('dictation draft',()=>{
 it('appends speech without replacing an existing draft or stripping its whitespace',()=>{
  expect(appendDictation('Мой вопрос',' ещё одно уточнение ')).toBe('Мой вопрос ещё одно уточнение');
  expect(appendDictation('Мой вопрос\n','Уточнение')).toBe('Мой вопрос\nУточнение');
  expect(appendDictation('Мой вопрос','   ')).toBe('Мой вопрос');
 });
 it('uses Safari MP4 when Opus recording is unavailable',()=>{
  expect(recordingMime(type=>type==='audio/mp4')).toBe('audio/mp4');
  expect(recordingMime(()=>false)).toBe('');
 });
});
describe('microphone ownership',()=>{
 it('releases a late microphone permission after cancellation instead of recording in another chat',async()=>{
  let grant!:(stream:MediaStream)=>void;
  const stop=vi.fn();
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:()=>new Promise<MediaStream>(resolve=>{grant=resolve})}});
  const capture=new DictationCapture(vi.fn()),starting=capture.start();capture.cancel();
  grant({getTracks:()=>[{stop}]} as unknown as MediaStream);
  expect(await starting).toBe(false);expect(stop).toHaveBeenCalledOnce();
 });
 it('waits for final recorder bytes and stops microphone tracks before returning audio',async()=>{
  const stop=vi.fn();const track={stop,onended:null};
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})}});
  class Recorder{
   static isTypeSupported(type:string){return type==='audio/mp4'}
   state='inactive';mimeType='audio/mp4';ondataavailable?: (event:{data:Blob})=>void;onstop?:()=>void;
   start(){this.state='recording'}
   stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['final audio bytes'])});this.onstop?.()})}
  }
  vi.stubGlobal('MediaRecorder',Recorder);
  const capture=new DictationCapture(vi.fn());expect(await capture.start()).toBe(true);
  const audio=await capture.stop();expect(audio.type).toBe('audio/mp4');expect(await audio.text()).toBe('final audio bytes');expect(stop).toHaveBeenCalledOnce();
 });
});
