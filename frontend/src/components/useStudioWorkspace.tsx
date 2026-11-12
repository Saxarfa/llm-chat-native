import {useEffect,useRef,useState,type PointerEvent,type KeyboardEvent} from 'react';
import {resizeStudioRect,zoomStudioAt,type ResizeSide,type StudioRect} from './studioGeometry';
import {StudioMotion,paintStudioLayout,studioStyles,studioDefaults as defaults,restoreStudioLayout,type StudioLayout as Layout} from './studioMotion';

type Kind='form'|'art'|'translator';
const interactive='button,input,textarea,select,a,summary,[role=button],[role=slider],[role=checkbox],[contenteditable]:not([contenteditable=false])';
const desktop=()=>window.matchMedia('(min-width:801px)').matches;

export function useStudioWorkspace(userId:string,mobile=false) {
 const viewport=useRef<HTMLDivElement>(null),container=useRef<HTMLDivElement>(null);
 const form=useRef<HTMLDivElement>(null),art=useRef<HTMLDivElement>(null),translator=useRef<HTMLDivElement>(null),zoomValue=useRef<HTMLSpanElement>(null);
 const wheelRect=useRef<DOMRect|null>(null);
 const restored=useRef(false);
 const wasMobile=useRef(mobile);
 const commandTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const stopCommandTransition=()=>{clearTimeout(commandTimer.current);if(container.current)delete container.current.dataset.cameraCommand};
 const startCommandTransition=()=>{if(!container.current||!desktop()||window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;clearTimeout(commandTimer.current);container.current.dataset.cameraCommand='true';commandTimer.current=setTimeout(stopCommandTransition,300)};
 const [savedLayout,commitLayout]=useState<Layout>(()=>{try{const saved=JSON.parse(localStorage.getItem('studio-workspace-v2-'+userId)||'null');const restoredLayout=restoreStudioLayout(saved);if(restoredLayout){restored.current=restoredLayout.complete;return restoredLayout.layout}}catch{}return defaults});
 const motion=useRef<StudioMotion|null>(null);
 if(!motion.current)motion.current=new StudioMotion(savedLayout,v=>paintStudioLayout(v,container.current,form.current,art.current,zoomValue.current,translator.current),v=>{wheelRect.current=null;if(container.current)delete container.current.dataset.cameraMoving;commitLayout(v)});
 const live=motion.current,layout=live.current;
 const setLayout=(change:(v:Layout)=>Layout)=>live.update(change);
 const finishMotion=()=>live.flush();
 useEffect(()=>()=>{clearTimeout(commandTimer.current);live.dispose();try{localStorage.setItem('studio-workspace-v2-'+userId,JSON.stringify(live.current))}catch{}},[userId]);
 const [active,setActive]=useState<Kind>('form'),[movingPanel,setMovingPanel]=useState<Kind|null>(null),[sizingWindow,setSizingWindow]=useState<Kind|null>(null),[panning,setPanning]=useState(false),[spaceHeld,setSpaceHeld]=useState(false);
 const space=useRef(false),panelDragged=useRef(false);
 const drag=useRef<{kind:Kind;pointer:number;x:number;y:number;rect:StudioRect;zoom:number}|null>(null);
 const sizing=useRef<{kind:Kind;side:ResizeSide;pointer:number;x:number;y:number;rect:StudioRect;zoom:number}|null>(null);
 const pan=useRef<{pointer:number;x:number;y:number;panX:number;panY:number}|null>(null);
 const rectFor=(v:Layout,kind:Kind):StudioRect=>kind==='form'?{x:v.x,y:v.y,width:v.width,height:v.formHeight}:kind==='art'?{x:v.artX,y:v.artY,width:v.artWidth,height:v.artHeight}:{x:v.translatorX,y:v.translatorY,width:v.translatorWidth,height:v.translatorHeight};
 const patchRect=(kind:Kind,rect:StudioRect)=>setLayout(v=>kind==='form'?{...v,x:rect.x,y:rect.y,width:rect.width,formHeight:rect.height}:kind==='art'?{...v,artX:rect.x,artY:rect.y,artWidth:rect.width,artHeight:rect.height}:{...v,translatorX:rect.x,translatorY:rect.y,translatorWidth:rect.width,translatorHeight:rect.height});
 useEffect(()=>{const timer=setTimeout(()=>{try{localStorage.setItem('studio-workspace-v2-'+userId,JSON.stringify(savedLayout))}catch{}},180);return()=>clearTimeout(timer)},[savedLayout,userId]);
 const fitView=(animate=false)=>{const area=viewport.current;if(!area||!desktop())return;if(animate)startCommandTransition();setLayout(v=>{const left=Math.min(v.x,v.artX,v.translatorX),top=Math.min(v.y,v.artY,v.translatorY),right=Math.max(v.x+v.width,v.artX+v.artWidth,v.translatorX+v.translatorWidth),bottom=Math.max(v.y+v.formHeight,v.artY+v.artHeight,v.translatorY+v.translatorHeight);const zoom=Math.max(.1,Math.min(1,(area.clientWidth-48)/(right-left),(area.clientHeight-48)/(bottom-top)));return {...v,zoom,panX:(area.clientWidth-(right-left)*zoom)/2-left*zoom,panY:(area.clientHeight-(bottom-top)*zoom)/2-top*zoom}})};
 useEffect(()=>{if(!mobile&&(!restored.current||wasMobile.current)){fitView(false);restored.current=true}wasMobile.current=mobile},[mobile]);
 useEffect(()=>{const area=viewport.current;if(!area)return;let width=desktop()?area.clientWidth:0,height=desktop()?area.clientHeight:0;const observer=new ResizeObserver(()=>{wheelRect.current=null;if(!desktop())return;const nextWidth=area.clientWidth,nextHeight=area.clientHeight;if(width&&height)setLayout(v=>({...v,panX:v.panX+(nextWidth-width)/2,panY:v.panY+(nextHeight-height)/2}));else fitView(false);width=nextWidth;height=nextHeight});observer.observe(area);return()=>observer.disconnect()},[mobile]);

 // Arrange only on request; keep panel sizes and the saved free-form workspace.
 const alignWindows=()=>{
  if(!desktop())return;
  startCommandTransition();setLayout(v=>({...v,translatorX:24,translatorY:24,x:24+v.translatorWidth+20,y:24,artX:24+v.translatorWidth+20+v.width+20,artY:24}));
  fitView(true);
 };
 useEffect(()=>{
  const onKey=(e:globalThis.KeyboardEvent)=>{
   const area=viewport.current;
   if(!(e.ctrlKey||e.metaKey)||e.altKey||!desktop()||!area||area.getClientRects().length===0)return;
   if((e.target as Element)?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
   if(e.key==='='||e.key==='+'){e.preventDefault();zoomBy(1.15)}
   else if(e.key==='-'){e.preventDefault();zoomBy(1/1.15)}
   else if(e.key==='0'){e.preventDefault();resetZoom()}
  };
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
});
 const resetZoom=()=>{const area=viewport.current;if(area){startCommandTransition();setLayout(v=>({...v,...zoomStudioAt(v,1,area.clientWidth/2,area.clientHeight/2)}))}};
 const zoomBy=(factor:number)=>{const area=viewport.current;if(area){startCommandTransition();setLayout(v=>({...v,...zoomStudioAt(v,v.zoom*factor,area.clientWidth/2,area.clientHeight/2)}))}};
 useEffect(()=>{
  const area=viewport.current;if(!area)return;
  const wheel=(e:WheelEvent)=>{
   if(!desktop())return;
   const insideScroll=(e.target as Element).closest('.studio-form,.studio-art-info,.studio-history-panel,.studio-filmstrip');
   if(insideScroll&&!e.ctrlKey&&!e.metaKey)return;
   e.preventDefault();if(drag.current||sizing.current||pan.current)return;stopCommandTransition();
   const nextZoom=Math.max(.1,Math.min(2,live.current.zoom*Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.003)));
   if(nextZoom===live.current.zoom)return;
   if(container.current&&container.current.dataset.cameraMoving!=='true')container.current.dataset.cameraMoving='true';
   const box=wheelRect.current||(wheelRect.current=area.getBoundingClientRect());
   setLayout(v=>({...v,...zoomStudioAt(v,nextZoom,e.clientX-box.left,e.clientY-box.top)}));
  };
  area.addEventListener('wheel',wheel,{passive:false});
  const keyDown=(e:globalThis.KeyboardEvent)=>{if(e.code!=='Space'||(e.target as Element)?.closest(interactive)||!desktop())return;e.preventDefault();space.current=true;setSpaceHeld(true)};
  const clear=()=>{finishMotion();space.current=false;setSpaceHeld(false);drag.current=null;sizing.current=null;pan.current=null;setMovingPanel(null);setSizingWindow(null);setPanning(false)};
  const keyUp=(e:globalThis.KeyboardEvent)=>{if(e.code==='Space'){space.current=false;setSpaceHeld(false)}};
  window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);window.addEventListener('blur',clear);
  return()=>{area.removeEventListener('wheel',wheel);window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',clear)};
 },[mobile]);
 const startPanelMove=(e:PointerEvent<HTMLElement>)=>{if(!e.currentTarget.contains(e.target as Node))return;panelDragged.current=false;if(!desktop()||e.button!==0||space.current)return;if((e.target as Element).closest('.studio-art-info,.studio-history-browser'))return;const control=(e.target as Element).closest(interactive);if(control&&!control.matches('.studio-canvas'))return;stopCommandTransition();const kind:Kind=e.currentTarget.matches('.studio-translator-window')?'translator':e.currentTarget.matches('.studio-art-window')?'art':'form';e.preventDefault();e.stopPropagation();(e.target as Element).setPointerCapture(e.pointerId);setActive(kind);drag.current={kind,pointer:e.pointerId,x:e.clientX,y:e.clientY,rect:rectFor(live.current,kind),zoom:live.current.zoom};setMovingPanel(kind)};
 const movePanel=(e:PointerEvent<HTMLElement>)=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.hypot(dx,dy)>3)panelDragged.current=true;patchRect(d.kind,{...d.rect,x:d.rect.x+dx/d.zoom,y:d.rect.y+dy/d.zoom})};
 const endPanelMove=()=>{finishMotion();drag.current=null;setMovingPanel(null)};
 const resetPanel=()=>{startCommandTransition();setLayout(v=>({...v,x:defaults.x,y:defaults.y}))};
 const resetArt=()=>{startCommandTransition();setLayout(v=>({...v,artX:defaults.artX,artY:defaults.artY}))};
 const resetTranslator=()=>{startCommandTransition();setLayout(v=>({...v,translatorX:defaults.translatorX,translatorY:defaults.translatorY}))};
 const panelKey=(e:KeyboardEvent<HTMLElement>)=>{if(e.target!==e.currentTarget||!desktop())return;const kind:Kind=e.currentTarget.closest('.studio-translator-window')?'translator':e.currentTarget.closest('.studio-art-window')?'art':'form';if(e.key==='Home'){e.preventDefault();if(kind==='art')resetArt();else if(kind==='translator')resetTranslator();else resetPanel()}if(!e.key.startsWith('Arrow'))return;e.preventDefault();stopCommandTransition();const step=e.shiftKey?40:10,rect=rectFor(live.current,kind);patchRect(kind,{...rect,x:rect.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),y:rect.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)})};
 const beginResize=(e:PointerEvent<HTMLButtonElement>,kind:Kind,side:ResizeSide)=>{if(!desktop()||e.button!==0)return;e.preventDefault();e.stopPropagation();stopCommandTransition();setActive(kind);e.currentTarget.setPointerCapture(e.pointerId);sizing.current={kind,side,pointer:e.pointerId,x:e.clientX,y:e.clientY,rect:rectFor(live.current,kind),zoom:live.current.zoom};setSizingWindow(kind)};
 const resize=(e:PointerEvent<HTMLButtonElement>)=>{const d=sizing.current;if(!d||d.pointer!==e.pointerId)return;e.stopPropagation();patchRect(d.kind,resizeStudioRect(d.rect,d.side,(e.clientX-d.x)/d.zoom,(e.clientY-d.y)/d.zoom,d.kind==='form'?260:320))};
 const endResize=(e:PointerEvent<HTMLButtonElement>)=>{e.stopPropagation();finishMotion();sizing.current=null;setSizingWindow(null)};
 const sideLabels={n:'сверху',s:'снизу',e:'справа',w:'слева',ne:'сверху справа',nw:'сверху слева',se:'снизу справа',sw:'снизу слева'};
 const resizeEdges=(kind:Kind)=>(Object.keys(sideLabels) as ResizeSide[]).map(side=><button key={side} type="button" className={`studio-window-resize resize-${side}`} aria-label={`${kind==='form'?'Настройки':kind==='art'?'Арт':'Переводчик'}: изменить размер ${sideLabels[side]}`} onPointerDown={e=>beginResize(e,kind,side)} onPointerMove={resize} onPointerUp={endResize} onPointerCancel={endResize} onLostPointerCapture={endResize} onKeyDown={e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();e.stopPropagation();patchRect(kind,resizeStudioRect(rectFor(live.current,kind),side,e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0,e.key==='ArrowDown'?20:e.key==='ArrowUp'?-20:0,kind==='form'?260:320))}}/>);
 const viewportHandlers={
  onPointerDownCapture:(e:PointerEvent<HTMLDivElement>)=>{if(!e.currentTarget.contains(e.target as Node))return;if(!desktop()||!(e.button===1||(e.button===0&&(space.current||!(e.target as Element).closest('.studio-controls-window,.studio-art-window,.studio-translator-window')))))return;e.preventDefault();e.stopPropagation();stopCommandTransition();e.currentTarget.setPointerCapture(e.pointerId);pan.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,panX:live.current.panX,panY:live.current.panY};setPanning(true)},
  onPointerMove:(e:PointerEvent<HTMLDivElement>)=>{const d=pan.current;if(d&&d.pointer===e.pointerId)setLayout(v=>({...v,panX:d.panX+e.clientX-d.x,panY:d.panY+e.clientY-d.y}))},
  onPointerUp:()=>{finishMotion();pan.current=null;setPanning(false)},onPointerCancel:()=>{finishMotion();pan.current=null;setPanning(false)},onLostPointerCapture:()=>{finishMotion();pan.current=null;setPanning(false)}
 };
 const styles=studioStyles(layout),style=styles.workspace,formStyle=styles.form,artStyle=styles.art,translatorStyle=styles.translator;
 return {layout,container,form,art,translator,zoomValue,viewport,style,formStyle,artStyle,translatorStyle,active,setActive,movingPanel,sizingWindow,panning,spaceHeld,viewportHandlers,startPanelMove,movePanel,endPanelMove,resetPanel,resetArt,resetTranslator,panelKey,panelDragged,resizeEdges,zoomBy,resetZoom,fitView:()=>fitView(true),alignWindows};
}
