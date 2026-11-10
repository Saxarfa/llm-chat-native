import {afterEach,describe,expect,it,vi} from 'vitest';
import {ReadAloudController} from './readAloud';

class AudioMock{
 static instances:AudioMock[]=[];
 src='';preload='';playbackRate=1;currentTime=0;duration=25;ended=false;
 onended:(()=>void)|null=null;ontimeupdate:(()=>void)|null=null;onloadedmetadata:(()=>void)|null=null;onerror:(()=>void)|null=null;
 play=vi.fn(async()=>{});pause=vi.fn();load=vi.fn();removeAttribute=vi.fn();
 constructor(){AudioMock.instances.push(this)}
}
function setup(){
 AudioMock.instances=[];vi.stubGlobal('Audio',AudioMock);vi.stubGlobal('window',{storageManager:{getAuthHeaders:()=>({Authorization:'Bearer private'})}});
 vi.stubGlobal('URL',{createObjectURL:vi.fn(()=>'blob:audio'),revokeObjectURL:vi.fn()});
 return new ReadAloudController();
}
afterEach(()=>vi.unstubAllGlobals());
describe('read aloud ownership',()=>{
 it('discards a response arriving after Stop, even if fetch ignores abort',async()=>{
  const controller=setup();let resolve!:(response:Response)=>void;
  vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{resolve=r})));
  const job=controller.start('old','текст','xenia',1);controller.stop();
  resolve(new Response(new Blob(['audio'])));await job;
  expect(controller.snapshot().phase).toBe('idle');expect(URL.createObjectURL).not.toHaveBeenCalled();
 });
 it('keeps only the newest answer and frees the old audio URL',async()=>{
  const controller=setup();vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Blob(['audio']))));
  await controller.start('one','первый','xenia',1);const first=AudioMock.instances[0];
  await controller.start('two','второй','aidar',1.2);
  expect(first.pause).toHaveBeenCalled();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:audio');
  controller.stop('one');expect(controller.snapshot().owner).toBe('two');
  controller.stop('two');expect(controller.snapshot().phase).toBe('idle');
 });
 it('supports pause, resume, seek and a changed rate during synthesis',async()=>{
  const controller=setup();let resolve!:(response:Response)=>void;
  vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{resolve=r})));
  const job=controller.start('one','ответ','xenia',1);controller.rate(1.5);
  resolve(new Response(new Blob(['audio'])));await job;const audio=AudioMock.instances[0];
  expect(audio.playbackRate).toBe(1.5);audio.onloadedmetadata?.();
  controller.seek(30);expect(audio.currentTime).toBe(25);
  await controller.toggle();expect(controller.snapshot().phase).toBe('paused');
  await controller.toggle();expect(controller.snapshot().phase).toBe('playing');
  audio.onended?.();expect(controller.snapshot().phase).toBe('ready');controller.stop();
 });
 it('leaves audio available for another tap when Safari blocks autoplay',async()=>{
  const controller=setup();let resolve!:(response:Response)=>void;
  vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{resolve=r})));
  const job=controller.start('one','ответ','xenia',1);const audio=AudioMock.instances[0];
  audio.play.mockRejectedValueOnce(new DOMException('gesture required','NotAllowedError'));
  resolve(new Response(new Blob(['audio'])));await job;
  expect(controller.snapshot().phase).toBe('ready');await controller.toggle();
  expect(controller.snapshot().phase).toBe('playing');controller.stop();
 });
 it('shows a server error without attempting to play it as audio',async()=>{
  const controller=setup();vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({detail:'Озвучка занята'}),{status:429})));
  await controller.start('one','ответ','xenia',1);
  expect(controller.snapshot()).toMatchObject({phase:'error',error:'Озвучка занята'});expect(URL.createObjectURL).not.toHaveBeenCalled();controller.stop();
 });
 it('syncs iOS Lock Screen / Dynamic Island MediaSession controls and position state',async()=>{
  const handlers=new Map<string,(details?:any)=>void>();
  const setPositionState=vi.fn();
  const mediaSession={
   metadata:null as any,
   playbackState:'none',
   setActionHandler:vi.fn((action:string,handler:(details?:any)=>void)=>handlers.set(action,handler)),
   setPositionState,
  };
  vi.stubGlobal('MediaMetadata',class{title:string;artist:string;album:string;constructor(init:any){this.title=init.title;this.artist=init.artist;this.album=init.album}});
  const controller=setup();
  vi.stubGlobal('navigator',{mediaSession});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Blob(['audio']))));
  await controller.start('one','Проверка экрана блокировки iOS','xenia',1);
  const audio=AudioMock.instances[0];
  audio.onloadedmetadata?.();
  expect(mediaSession.playbackState).toBe('playing');
  expect(mediaSession.metadata?.title).toBe('Проверка экрана блокировки iOS');
  expect(setPositionState).toHaveBeenCalledWith({duration:25,playbackRate:1,position:0});
  handlers.get('seekforward')?.({seekOffset:12});
  expect(audio.currentTime).toBe(12);
  handlers.get('pause')?.();
  expect(controller.snapshot().phase).toBe('paused');
  expect(mediaSession.playbackState).toBe('paused');
  handlers.get('stop')?.();
  expect(controller.snapshot().phase).toBe('idle');
  expect(mediaSession.playbackState).toBe('none');
 });
});
