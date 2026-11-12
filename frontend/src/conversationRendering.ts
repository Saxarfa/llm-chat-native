// Cache real sizes before skipping off-screen content. An arbitrary estimated
// height would change scrollHeight and move the reader, especially in Safari.
export function observeConversationRendering(column:HTMLElement){
 if(!CSS.supports('content-visibility','auto')||!CSS.supports('contain-intrinsic-block-size','auto 1px'))return()=>{};
 const rows=new Set<HTMLElement>();
 // Establish the same formatting context before the first measurement. Adding
 // layout containment only when a row disappears can change collapsed margins.
 let width=0,frame=0,disposed=false,ready=false,reflow=false;
 const pending=new Map<HTMLElement,number>();
 // Historical footer/variant entrances can still be settling on mount. Let
 // ResizeObserver collect their final sizes before caching off-screen rows.
 const warmup=setTimeout(()=>{
  ready=true;
  rows.forEach(row=>{if(row.style.getPropertyValue('--message-render-height'))row.dataset.renderCached='true'});
 },400);
 const clear=(row:HTMLElement)=>{delete row.dataset.renderCached;row.style.removeProperty('--message-render-height')};
 const cache=(row:HTMLElement,height:number)=>{
  // Live replies are always visible. Updating an inherited CSS variable on
  // every token invalidates the styles/layout of their entire Markdown tree.
  // Wait for the completed row's size (including its footer) instead.
  if(row.classList.contains('live-message'))return;
  if(!Number.isFinite(height)||height<=0)return;
  const value=`${height}px`;
  if(row.style.getPropertyValue('--message-render-height')!==value)row.style.setProperty('--message-render-height',value);
  if(ready)row.dataset.renderCached='true';
 };
 const schedule=()=>{
  if(frame)return;
  frame=requestAnimationFrame(()=>{
   frame=0;if(disposed)return;
   if(reflow){
    reflow=false;pending.clear();
    // Changing containment during ResizeObserver delivery can resize ancestors
    // already delivered in that pass, causing a notification loop. Reflow once
    // in the next frame, reading all natural sizes before restoring containment.
    rows.forEach(clear);
    const current=[...rows],heights=current.map(row=>parseFloat(getComputedStyle(row).height));
    current.forEach((row,i)=>cache(row,heights[i]));
   }else{
    pending.forEach((height,row)=>{if(rows.has(row))cache(row,height)});
    pending.clear();
   }
  });
 };
 const observer=new ResizeObserver(entries=>{
  const columnEntry=entries.find(entry=>entry.target===column);
  const nextWidth=columnEntry?.contentRect.width;
  if(nextWidth!=null&&nextWidth>0){
   const changed=width>0&&Math.abs(nextWidth-width)>.5;width=nextWidth;
   if(changed)reflow=true;
  }
  for(const entry of entries){
   const row=entry.target as HTMLElement;
   if(rows.has(row)&&!row.classList.contains('live-message'))pending.set(row,entry.contentRect.height);
  }
  if(reflow||pending.size)schedule();
 });
 const collect=()=>{
  const current=new Set(column.querySelectorAll<HTMLElement>('.message[data-message-id]'));
  for(const row of rows)if(!current.has(row)){observer.unobserve(row);clear(row);delete row.dataset.renderMeasured;rows.delete(row);pending.delete(row)}
  for(const row of current)if(!rows.has(row)){rows.add(row);row.dataset.renderMeasured='true';observer.observe(row)}
 };
 observer.observe(column);collect();
 // Appending history must not disconnect observers or invalidate the exact
 // heights of rows that are already prepared and skipped off-screen.
 const changes=typeof MutationObserver==='undefined'?null:new MutationObserver(collect);
 changes?.observe(column,{childList:true});
 return()=>{disposed=true;clearTimeout(warmup);cancelAnimationFrame(frame);pending.clear();changes?.disconnect();observer.disconnect();rows.forEach(row=>{clear(row);delete row.dataset.renderMeasured})};
}
