// Server polls decode fresh JSON objects even when history has not changed.
// Reuse equal branches so memoized messages do not re-render the entire chat.
export function shareSnapshot<T>(previous:T,next:T):T{
 if(Object.is(previous,next))return previous;
 if(!previous||!next||typeof previous!=='object'||typeof next!=='object'||Array.isArray(previous)!==Array.isArray(next))return next;
 const before=previous as Record<string,unknown>,after=next as Record<string,unknown>,keys=Object.keys(after);
 let result:Record<string,unknown>|unknown[]|undefined=Object.keys(before).length!==keys.length?(Array.isArray(next)?[]:{}):undefined;
 for(let i=0;i<keys.length;i++){
  const key=keys[i];
  const value=Object.hasOwn(before,key)?shareSnapshot(before[key],after[key]):after[key];
  if(!result&&(!Object.hasOwn(before,key)||!Object.is(value,before[key]))){
   result=Array.isArray(next)?[]:{};
   for(let j=0;j<i;j++)Object.defineProperty(result,keys[j],{value:before[keys[j]],writable:true,enumerable:true,configurable:true});
  }
  if(result)Object.defineProperty(result,key,{value,writable:true,enumerable:true,configurable:true});
 }
 return (result??previous) as T;
}
