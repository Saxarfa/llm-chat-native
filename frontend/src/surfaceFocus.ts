// Safari can blur a pressed button before a portal's autofocus callback runs.
// Keep only the latest pointer trigger, never a stack of retained surfaces.
let pointerTrigger:WeakRef<HTMLElement>|null=null,pointerTime=0;
if(typeof document!=='undefined')document.addEventListener('pointerdown',event=>{
 const target=event.target instanceof Element?event.target.closest<HTMLElement>('button,a[href],[role=button],[role=menuitem]'):null;
 pointerTrigger=target?new WeakRef(target):null;pointerTime=performance.now();
},true);

export function surfaceOpener(){
 const trigger=pointerTrigger?.deref();
 if(trigger?.isConnected&&performance.now()-pointerTime<500)return trigger;
 const active=document.activeElement;
 return active instanceof HTMLElement&&active!==document.body?active:null;
}
