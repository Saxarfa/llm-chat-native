export type ModelCategory='local'|'studio'|'subscription';
export type ModelPickerPreferences={category:ModelCategory;order:string[]};
export const modelCategory=(id:string):ModelCategory=>id.startsWith('aistudio/')?'studio':(id.startsWith('google-subscription/')||id.startsWith('gemini-web/'))?'subscription':'local';
export function readModelPickerPreferences(key:string,fallback:ModelCategory):ModelPickerPreferences{
 try{
  const value=JSON.parse(localStorage.getItem(key)||'null');
  return {category:['local','studio','subscription'].includes(value?.category)?value.category:fallback,
   order:Array.isArray(value?.order)?[...new Set<string>(value.order.filter((id:unknown)=>typeof id==='string'))]:[]};
 }catch{return {category:fallback,order:[]}}
}
export function moveModel(order:string[],visible:string[],source:string,target:string){
 if(source===target||!visible.includes(source)||!visible.includes(target))return order;
 const next=[...visible],from=next.indexOf(source),to=next.indexOf(target);
 next.splice(from,1);next.splice(to,0,source);
 const remaining=order.filter(id=>!visible.includes(id));
 return [...remaining,...next];
}
