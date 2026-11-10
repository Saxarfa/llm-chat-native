// A bounded cache of pure prepared output. Account changes clear it; evicted
// messages are prepared normally, without changing their persisted content.
export class PreparedContentCache<T>{
 private entries=new Map<object,{text:string;revision:unknown;value:T}>();
 private size=0;
 constructor(private limit=64,private budget=500_000){}
 clear(){this.entries.clear();this.size=0}
 prepare(key:object,text:string,revision:unknown,create:()=>T):T{
  const previous=this.entries.get(key);
  if(previous&&previous.text===text&&Object.is(previous.revision,revision)){
   this.entries.delete(key);this.entries.set(key,previous);return previous.value;
  }
  if(previous){this.entries.delete(key);this.size-=previous.text.length}
  const value=create();
  if(text.length>this.budget/2)return value;
  this.entries.set(key,{text,revision,value});this.size+=text.length;
  while(this.entries.size>this.limit||this.size>this.budget){
   const oldest=this.entries.keys().next().value!;
   this.size-=this.entries.get(oldest)!.text.length;this.entries.delete(oldest);
  }
  return value;
 }
}
