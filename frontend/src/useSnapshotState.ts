import {useCallback,useState,type Dispatch,type SetStateAction} from 'react';
import {shareSnapshot} from './shareSnapshot';

// Polling returns fresh JSON objects. Equal snapshots should preserve state
// and skip React commits, while changed branches retain their own identity.
export function useSnapshotState<T>(initial:T|(()=>T)){
 const [value,setValue]=useState(initial);
 const setSnapshot=useCallback<Dispatch<SetStateAction<T>>>(next=>{
  setValue(previous=>shareSnapshot(previous,typeof next==='function'?(next as (v:T)=>T)(previous):next));
 },[]);
 return [value,setSnapshot] as const;
}
