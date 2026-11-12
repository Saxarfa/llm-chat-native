import {useCallback,useEffect,useRef,useState} from 'react';
export type MainPage='chat'|'images'|'workspace';
export type PageRequest<T extends string=MainPage>={id:number;target:T;status:'loading'|'error';error?:string};

/** Requested data/code can prepare invisibly while the presented page stays put. */
export function usePreparedPage<T extends string=MainPage>(initial:T='chat' as T){
 const [page,setPage]=useState(initial),[pending,setPending]=useState<PageRequest<T>>();
 const current=useRef(page);current.current=page;
 const sequence=useRef(0),requestRef=useRef<{id:number;target:T;resolve:(shown:boolean)=>void;promise:Promise<boolean>}|undefined>(undefined);
 const cancel=useCallback(()=>{sequence.current++;requestRef.current?.resolve(false);requestRef.current=undefined;setPending(undefined)},[]);
 const request=useCallback((target:T)=>{
  if(current.current===target){cancel();return Promise.resolve(true)}
  if(requestRef.current?.target===target)return requestRef.current.promise;
  requestRef.current?.resolve(false);
  const id=++sequence.current;let resolve!:(shown:boolean)=>void;
  const promise=new Promise<boolean>(done=>{resolve=done});
  requestRef.current={id,target,resolve,promise};setPending({id,target,status:'loading'});
  return promise;
 },[cancel]);
 const ready=useCallback((id:number,error?:string)=>{
  const request=requestRef.current;if(!request||request.id!==id||sequence.current!==id)return;
  requestRef.current=undefined;
  if(error){setPending({id,target:request.target,status:'error',error});request.resolve(false);return}
  current.current=request.target;setPage(request.target);setPending(undefined);request.resolve(true);
 },[]);
 useEffect(()=>()=>{sequence.current++;requestRef.current?.resolve(false);requestRef.current=undefined},[]);
 return {page,pending,request,ready,cancel};
}
