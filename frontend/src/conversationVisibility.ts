// IntersectionObserver tracks visibility without synchronous geometry reads
// for every message on every scroll frame.
export function observeConversationVisibility(root:HTMLElement,onChange:(visible:Set<string>)=>void){
 const visible=new Set<string>(),rows=new Set<HTMLElement>();
 const observer=new IntersectionObserver(entries=>{
  let changed=false;
  for(const entry of entries){
   if(!rows.has(entry.target as HTMLElement))continue;
   const id=(entry.target as HTMLElement).dataset.messageId;
   if(!id)continue;
   const next=entry.isIntersecting;
   if(next===visible.has(id))continue;
   if(next)visible.add(id);else visible.delete(id);
   changed=true;
  }
  if(changed)onChange(new Set(visible));
 },{root,threshold:0});
 const collect=()=>{
  const current=new Set(root.querySelectorAll<HTMLElement>('.message[data-message-id]'));
  let changed=false;
  for(const row of rows)if(!current.has(row)){observer.unobserve(row);rows.delete(row);changed=visible.delete(row.dataset.messageId!)||changed}
  for(const row of current)if(!rows.has(row)){rows.add(row);observer.observe(row)}
  if(changed)onChange(new Set(visible));
 };
 collect();
 const changes=typeof MutationObserver==='undefined'?null:new MutationObserver(collect);
 changes?.observe(root.querySelector?.('.message-column')||root,{childList:true});
 return()=>{changes?.disconnect();observer.disconnect()};
}
