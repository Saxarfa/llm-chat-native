import {useEffect,useRef,useState} from 'react';
import {safeStreamEnd} from './domain';

export function advanceAnswer(position:number,length:number,elapsed:number){
 const backlog=Math.max(0,length-position);
 // Keep a short visual buffer so streamed text follows the model closely
 // without snapping forward when an SSE update contains a burst.
 const speed=Math.min(5000,Math.max(900,backlog/.18));
 return Math.min(length,position+speed*Math.min(50,Math.max(0,elapsed))/1000);
}

const wordFade=180,initialSpeed=650;

export function advanceWordAnswer(position:number,speed:number,length:number,elapsed:number){
 const seconds=Math.min(50,Math.max(0,elapsed))/1000;
 const target=Math.min(5000,Math.max(900,(length-position)/.18));
 const nextSpeed=speed+(target-speed)*(1-Math.exp(-seconds/.12));
 return {position:Math.min(length,position+(speed+nextSpeed)*.5*seconds),speed:nextSpeed};
}

// Prefer complete words in a buffered burst. Long URLs and text without spaces
// still make progress, and the final boundary always includes every character.
export function answerWordEnd(text:string,position:number,previous=0){
 const end=safeStreamEnd(text,Math.min(text.length,Math.max(previous,Math.floor(position))));
 if(end===text.length||/\s/u.test(text[end]||''))return end;
 let boundary=end;
 while(boundary>previous&&!/\s/u.test(text[boundary-1]))boundary--;
 return boundary>previous?boundary:end-previous>=48?end:previous;
}

function firstWordEnd(text:string){
 const word=/\S+\s*/u.exec(text);
 return word?safeStreamEnd(text,Math.min(48,word.index+word[0].length)):0;
}

function answerCursor(text:string,key:string,streaming:boolean,instant:boolean,words:boolean){
 const active=streaming&&!instant;
 return {key,source:text,position:active?0:text.length,end:active?0:text.length,
  animating:active,streaming,instant,words,speed:initialSpeed,lastFrame:0,lastPaint:0,lastReveal:-Infinity};
}

// One animation loop reads the latest source. Incoming chunks cannot reset its
// clock or speed, and finishing on the server does not flush the buffered tail.
export function useSmoothAnswer(text:string,key:string,streaming:boolean,instant:boolean,words=false){
 const cursor=useRef(answerCursor(text,key,streaming,instant,words)),frame=useRef(0);
 const [shown,setShown]=useState({key,text:streaming&&!instant?'':text,settling:false});
 useEffect(()=>{
  let state=cursor.current;
  if(state.key!==key||!text.startsWith(state.source)){
   cancelAnimationFrame(frame.current);frame.current=0;
   state=cursor.current=answerCursor(text,key,streaming,instant,words);
  }
  Object.assign(state,{source:text,streaming,instant,words});
  if(instant||(!streaming&&!state.animating)){
   state.position=text.length;state.end=text.length;state.lastReveal=-Infinity;
  }
  if(streaming&&!instant)state.animating=true;
  if(words&&!instant&&state.animating&&state.end===0)state.position=Math.max(state.position,firstWordEnd(text));
  const publish=(now:number)=>{
   const current=cursor.current;
   const end=current.words?answerWordEnd(current.source,current.position,current.end):safeStreamEnd(current.source,Math.floor(current.position));
   if(end>current.end)current.lastReveal=now;
   current.end=end;current.lastPaint=now;
   const settling=current.words&&!current.instant&&!current.streaming&&end===current.source.length&&now-current.lastReveal<wordFade;
   const value=current.source.slice(0,end);
   setShown(previous=>previous.key===current.key&&previous.text===value&&previous.settling===settling?previous:{key:current.key,text:value,settling});
   const pending=end<current.source.length||settling;
   if(!current.streaming&&!pending)current.animating=false;
   return pending;
  };
  // An existing reveal loop already reads the newest source. Publishing again
  // from every SSE effect bypasses its paint cadence and reparses Markdown.
  if(frame.current&&!instant)return;
  const now=performance.now(),pending=publish(now);
  if(!pending||instant){cancelAnimationFrame(frame.current);frame.current=0;return}
  if(frame.current)return;
  state.lastFrame=now;
  const tick=(now:number)=>{
   const current=cursor.current,elapsed=now-current.lastFrame;current.lastFrame=now;
   if(current.words)Object.assign(current,advanceWordAnswer(current.position,current.speed,current.source.length,elapsed));
   else current.position=advanceAnswer(current.position,current.source.length,elapsed);
   if(now-current.lastPaint>=32||current.position>=current.source.length){
    if(!publish(now)){frame.current=0;return}
   }
   frame.current=requestAnimationFrame(tick);
  };
  frame.current=requestAnimationFrame(tick);
 },[text,key,streaming,instant,words]);
 useEffect(()=>()=>{cancelAnimationFrame(frame.current);frame.current=0},[]);
 // A saved variant or remote edit is already complete. Publish it in this
 // render; a stale frame would label it as streaming and skip height animation.
 // Keep draining the real stream's buffered tail after the server finishes.
 const content=instant||(!streaming&&!cursor.current.animating)?text:shown.key===key?shown.text:streaming?'':text;
 return {text:content,revealing:!instant&&(content!==text||shown.settling)};
}
