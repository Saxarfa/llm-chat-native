/* One delegated interaction system for the site and desktop shell.
 * State animations belong to components; hover never changes application state. */
(() => {
 'use strict';
 if(typeof document==='undefined'||document.documentElement.dataset.iconMotionSystem)return;
 document.documentElement.dataset.iconMotionSystem='8';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),hover=matchMedia('(any-hover: hover)');
 const selector='svg.app-icon,svg[data-icon-motion],img[data-icon-motion],i[data-icon-motion=frame],.new-chat-icon,.brand-coffee';
 const hosts='button,a[href],summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option],[role=checkbox],[role=switch],[role=combobox],label,[data-icon-motion-host],.model-search,.sidebar-search,.workspace-search,.settings-model-search';
 const interactive='button,a[href],summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option],[role=checkbox],[role=switch],[role=combobox],label';
 const dense='.answer-footer,.answer-actions,.message-actions,.question-actions,.chat-action-slot,.window-controls,.model-option';
 const running=new WeakMap(),pressing=new WeakMap(),active=new Set();
 const hovered=new Set();
 let focused=new WeakSet();
 let touchPress=null,mousePress=null,keyPress=null,hoverFrame=0;
 const touchPointers=new Set();
 // Same curve as --motion-ease in motionSystem.css; WAAPI easing cannot read a CSS variable.
 const ease='cubic-bezier(.23,1,.32,1)';
 const families={};
 const group=(recipe,names)=>names.split(' ').forEach(name=>families[name]=recipe);
 group('new-chat','new-chat');
 group('conversation','conversation');
 group('grid','layout-grid shapes');
 group('search','search');
 group('gear','settings wrench');
 group('sliders','settings-2 sliders-horizontal');
 group('arrow','arrow-down arrow-left arrow-right arrow-up arrow-up-right undo-2 corner-down-left');
 group('transfer','download upload log-out share');
 group('swap','arrow-left-right');
 group('return','rotate-ccw rotate-ccw-clock history');
 group('expand','expand shrink');
 group('layers','layers layers-3');
 group('image','image image-plus image-off images');
 group('sparkle','sparkles');
 group('folder-plus','folder-plus bookmark-plus');
 group('copy','copy');
 group('coffee','coffee');
 group('bubble','message-square message-circle chat');
 group('mask','venetian-mask');
 group('chevron','chevron-down chevron-up chevron-left chevron-right');
 group('menu','menu');
 group('dots','ellipsis ellipsis-vertical more-horizontal more-vertical dot grip-vertical');
 group('panel','panel-left columns-2 panels-top-left');
 group('confirm','check');
 group('add','plus');
 group('close','x');
 group('collapse','minus');
 group('trash','trash trash-2');
 group('write','pencil feather brush');
 group('erase','eraser');
 group('book','book-open');
 group('study','graduation-cap');
 group('brain','brain');
 group('cpu','cpu model');
 group('database','database');
 group('globe','globe cloud');
 group('branch','git-branch link-2');
 group('clapper','clapperboard');
 group('play','play');
 group('pause','pause');
 group('stop','square');
 group('film','film');
 group('favorite','star bookmark');
 group('archive','archive');
 group('document','file-text file-diff');
 group('page','file');
 group('checklist','list-checks');
 group('pin','pin pin-off');
 group('refresh','refresh-cw repeat');
 group('folder','folder folder-open');
 group('mic','mic');
 group('zoom','zoom-in zoom-out');
 group('expand','scan');
 group('notice','triangle-alert circle-alert info wifi-off');
 group('library','library');
 group('chart','chart-no-axes-column chart-no-axes-combined');
 group('languages','languages');
 group('power','power');
 group('volume','volume-2');
 group('monitor','monitor video');
 group('plug','plug');
 group('user','user-round');
 group('eye','eye eye-off');
 group('lock','lock-keyhole');
 group('code','code-xml chevrons-left-right');
 group('moon','moon eclipse');
 group('robot','bot');
 group('ghost','ghost');
 group('paperclip','paperclip');
 group('shield','shield shield-check');
 group('bell','bell bell-ring bell-off');
 group('terminal','terminal');
 group('sun','sun');
 group('indicator','loader-circle circle context progress startup-orbit');
 group('frame','frame');
 group('brand','brand');
 group('rain','rain');
 const nameOf=icon=>icon.dataset.iconMotion||icon.dataset.icon||'common';
 // Framework7 glyphs (frontend/src/icons) are one filled path in a 56px grid, so
 // part-level recipes do not apply: the whole symbol moves, SF Symbols style.
 const glyphFrames=(recipe,name,a)=>{
  const turn=deg=>[{rotate:'0deg'},{rotate:`${deg}deg`,offset:.42},{rotate:'0deg'}];
  const grow=v=>[{scale:'1'},{scale:String(v),offset:.42},{scale:'1'}];
  const x=/left|undo|ccw/.test(name)?-a:/right|log-out|play/.test(name)?a:0;
  const y=/up|upload|share/.test(name)?-a:/down|download/.test(name)?a:0;
  switch(recipe){
   case 'arrow':case 'transfer':case 'chevron':case 'play':return translatePulse(x,y);
   case 'pin':return translatePulse(0,name==='pin-off'?-a:a*.65);
   case 'confirm':return translatePulse(0,-a*.6);
   case 'add':return grow(1.08);
   case 'refresh':return name==='repeat'?translatePulse(a,0):turn(40);
   case 'return':return turn(-40);
   case 'gear':case 'sun':return turn(30);
   case 'moon':return turn(-15);
   case 'trash':case 'write':case 'paperclip':return turn(-10);
   case 'bell':return [{rotate:'0deg'},{rotate:'12deg',offset:.25},{rotate:'-9deg',offset:.6},{rotate:'0deg'}];
   case 'favorite':return [{rotate:'0deg',scale:'1'},{rotate:'8deg',scale:'1.12',offset:.42},{rotate:'0deg',scale:'1'}];
   case 'close':case 'stop':case 'collapse':return grow(.86);
   case 'menu':case 'dots':case 'panel':case 'sliders':case 'swap':return translatePulse(a*.8,0);
   default:return grow(1.1);
  }
 };
 const owner=target=>target instanceof Element?(target.closest(hosts)||target.closest(selector)):null;
 const enabled=host=>host&&!host.matches(':disabled,[aria-disabled=true],[data-disabled]')&&!host.closest('[inert],[hidden],[aria-disabled=true],[data-disabled]');
 const iconsFor=host=>[...(host.matches(selector)?[host]:[]),...host.querySelectorAll(selector)].filter(icon=>owner(icon)===host&&icon.dataset.iconMotion!=='off');
 const partsOf=icon=>icon.localName==='svg'?[...icon.children].filter(node=>/^(path|circle|rect|line|polyline|polygon|ellipse|g)$/.test(node.localName)):[icon];
 // Busy symbols already animate with their operation; do not restart them.
 const stateOnly=icon=>icon.matches('.spin,.startup-orbit,[data-icon-motion=startup-orbit]')||!!icon.closest('.activity-glyph[data-state=running]');
 function recordFor(icon,map){
  const record={icon,animations:[],targets:[],epoch:0,done:false};
  record.clean=()=>{
   if(record.done)return;record.done=true;record.epoch++;
   record.animations.forEach(a=>a.cancel());
   if(map.get(icon)===record)map.delete(icon);
   active.delete(record);
  };
  record.watch=()=>{
   const epoch=++record.epoch;
   Promise.all(record.animations.map(a=>a.finished.catch(()=>{}))).then(()=>{if(record.epoch===epoch)record.clean()});
  };
  map.set(icon,record);active.add(record);return record;
 }
 function add(record,node,frames,duration=300,delay=0,fill='none'){
  if(!node||!node.isConnected)return;
  // A new entry can interrupt the return animation. Resume at the drawn
  // position rather than jumping to the first frame or queuing another cycle.
  const resume=record.resume?.get(node);
  if(resume){
   const first={...frames[0]};
   for(const key of Object.keys(first))if(key!=='offset'&&key!=='transformOrigin')first[key]=resume[key];
   frames=[first,...frames.slice(1)];delay=0;
  }
  // Ease each segment, not the whole run: one curve across a there-and-back
  // pulse would squeeze the outward move into its first ~11%.
  const segmented=frames.length>2;
  if(segmented)frames=frames.map((frame,index)=>index<frames.length-1&&!frame.easing?{...frame,easing:ease}:frame);
  record.animations.push(node.animate(frames,{duration,delay,easing:segmented?'linear':ease,fill}));
  record.targets.push({node,end:frames[frames.length-1]});
 }
 function localOrigin(node){
  const b=node.getBBox();return `${b.x+b.width/2}px ${b.y+b.height/2}px`;
 }
 const pulse=(transform,origin='12px 12px')=>[
  {transform:'none',transformOrigin:origin},
  {transform,transformOrigin:origin,offset:.42},
  {transform:'none',transformOrigin:origin},
 ];
 const translatePulse=(x,y)=>[{translate:'0px 0px'},{translate:`${x}px ${y}px`,offset:.42},{translate:'0px 0px'}];
 function accent(record,node,delay=0){
  if(!node)return;
  const opacity=Number(getComputedStyle(node).opacity);
  add(record,node,[{opacity},{opacity:opacity*.58,offset:.35},{opacity}],280,delay);
 }
 function play(icon,host){
  if(reduced.matches||stateOnly(icon))return;
  const name=nameOf(icon),recipe=families[name]||'accent';
  icon.dataset.iconRecipe=recipe;
  const size=icon.getBoundingClientRect().width;
  const previous=running.get(icon),resume=new Map();
  previous?.targets.forEach(({node,end})=>{
   const style=getComputedStyle(node),current={};
   for(const key of Object.keys(end))if(key!=='offset')current[key]=style[key];
   resume.set(node,current);
  });
  previous?.clean();
  const parts=partsOf(icon),record=recordFor(icon,running),amount=icon.closest(dense)||size<=14 ? .75 : size<=17 ? 1 : 1.4;
  record.host=host;record.resume=resume;
  if(icon.classList.contains('f7-icon')){
   add(record,icon,glyphFrames(recipe,name,amount*1.2),300);
   record.watch();return;
  }
  const move=(nodes,x,y,duration=280)=>nodes.forEach(node=>add(record,node,translatePulse(x,y),duration));
  switch(recipe){
   case 'bubble':
    parts.forEach(node=>add(record,node,pulse('scale(1.045,1.025)','5px 19px'),300));break;
   case 'mask':
    [parts[0],parts[2]].filter(Boolean).forEach(node=>add(record,node,pulse('scaleX(1.16)',localOrigin(node)),300));break;
   case 'chevron': {
    const open=host.getAttribute('aria-expanded')==='true'||icon.matches('.rotated,.is-open,.expanded');
    const x=/left/.test(name)?-amount:/right/.test(name)?amount:0;
    const y=/down/.test(name)?amount:/up/.test(name)?-amount:0;
    // Root rotation belongs to the disclosure; local movement follows it.
    move(parts,x,open&&name==='chevron-down'&&getComputedStyle(icon).transform==='none'?-y:y);break;
   }
   case 'menu':
    parts.forEach((node,i)=>add(record,node,translatePulse(i%2?-amount:amount,0),280,i*18));break;
   case 'dots':
    parts.forEach((node,i)=>add(record,node,pulse('scale(1.38)',localOrigin(node)),260,i*25));break;
   case 'panel':move(parts.filter(node=>node.localName==='path'),amount,0);break;
   case 'confirm':
    // An already-visible check responds without inventing a success state.
    move(parts,0,-amount*.6);break;
   case 'add':parts.forEach(node=>add(record,node,pulse('scale(1.08)'),300));break;
   case 'close':parts.forEach(node=>add(record,node,pulse('scale(.86)'),280));break;
   case 'collapse':parts.forEach(node=>add(record,node,pulse('scaleX(.78)'),280));break;
   case 'trash':move(parts.slice(-2),0,-amount);break;
   case 'write':
    parts.forEach(node=>add(record,node,pulse(`translate(${amount}px,${-amount*.4}px) rotate(-4deg)`,'4px 20px'),300));break;
   case 'erase':move(parts,-amount,0);break;
   case 'book':parts.slice(1).forEach(node=>add(record,node,pulse('scaleX(1.065)','12px 20px'),300));break;
   case 'study':add(record,parts[1],pulse('rotate(8deg)','22px 10px'),300);break;
   case 'brain':parts.slice(0,3).forEach((node,i)=>accent(record,node,i*20));break;
   case 'cpu':add(record,parts.at(-1),pulse('scale(1.12)'),300);break;
   case 'database':move(parts.slice(2),0,-amount);break;
   case 'globe':add(record,parts[1],pulse('scaleX(.72)'),320);break;
   case 'branch':
    parts.filter(node=>node.localName==='circle').forEach((node,i)=>add(record,node,translatePulse(i?-amount:amount,i?amount:-amount),300));break;
   case 'clapper':
    [parts[0],parts[1],parts[3]].filter(Boolean).forEach(node=>add(record,node,pulse('rotate(-5deg)','3px 11px'),320));break;
   case 'play':move(parts,amount,0);break;
   case 'pause':parts.forEach((node,i)=>add(record,node,translatePulse(i?-amount*.5:amount*.5,0),280));break;
   case 'stop':parts.forEach(node=>add(record,node,pulse('scale(.9)'),280));break;
   case 'film':
    parts.slice(1).filter(node=>{const b=node.getBBox();return b.width>b.height}).forEach(node=>add(record,node,translatePulse(0,amount),300));break;
   case 'favorite':parts.forEach(node=>add(record,node,pulse('rotate(7deg) scale(1.06)'),320));break;
   case 'archive':move(parts.slice(0,1),0,-amount);break;
   case 'document':parts.slice(2).forEach((node,i)=>add(record,node,translatePulse(amount,0),280,i*20));break;
   case 'page':add(record,parts[1],pulse('scale(.9)','14px 8px'),280);break;
   case 'checklist':parts.slice(0,3).forEach((node,i)=>add(record,node,translatePulse(amount*.65,0),280,i*20));break;
   case 'pin':
    // Individual translate composes with the actual pinned CSS transform.
    move(parts,0,name==='pin-off'?-amount:amount*.65);break;
   case 'refresh':
    if(name==='repeat')parts.forEach((node,i)=>add(record,node,translatePulse(i<2?amount:-amount,0),300));
    else parts.forEach(node=>add(record,node,pulse('rotate(24deg)'),320));break;
   case 'folder':parts.forEach(node=>add(record,node,pulse('scaleY(.93)','12px 20px'),300));break;
   case 'mic':move(parts.filter(node=>node.localName==='rect'),0,-amount*.6);break;
   case 'zoom':
    parts.filter(node=>node.localName==='circle').forEach(node=>add(record,node,pulse(`scale(${name==='zoom-in'?1.09:.91})`,localOrigin(node)),300));break;
   case 'notice':(name==='wifi-off'?parts.slice(-1):parts.slice(1)).forEach((node,i)=>accent(record,node,i*15));break;
   case 'library':parts.forEach((node,i)=>add(record,node,pulse(`rotate(${i%2?3:-3}deg)`,'12px 20px'),280,i*15));break;
   case 'chart':
    parts.filter(node=>{const b=node.getBBox();return b.height>b.width}).forEach((node,i)=>add(record,node,pulse('scaleY(.78)','12px 21px'),280,i*12));break;
   case 'languages':parts.forEach((node,i)=>add(record,node,translatePulse(i<4?-amount*.6:amount*.6,0),300));break;
   case 'power':move(parts.slice(0,1),0,amount*.65);break;
   case 'volume':parts.slice(1).forEach((node,i)=>add(record,node,translatePulse(amount*(i+1)*.65,0),280,i*30));break;
   case 'monitor':add(record,parts.find(node=>node.localName==='rect'),pulse('scaleY(.95)','12px 17px'),300);break;
   case 'plug':move(parts.slice(1),0,-amount*.65);break;
   case 'user':move(parts.filter(node=>node.localName==='circle'),0,-amount*.65);break;
   case 'eye':
    if(name==='eye')move(parts.filter(node=>node.localName==='circle'),amount*.6,0);
    else accent(record,parts.at(-1));break;
   case 'lock':add(record,parts.find(node=>node.localName==='circle'),pulse('scale(1.35)','12px 16px'),280);break;
   case 'code':move(parts.slice(0,1),amount,0);move(parts.slice(1,2),-amount,0);break;
   case 'robot':
    move(parts.slice(0,1),0,-amount*.7);parts.slice(-2).forEach(node=>add(record,node,pulse('scaleY(.65)',localOrigin(node)),280));break;
   case 'ghost':move(parts,0,-amount*.7,300);break;
   case 'paperclip':parts.forEach(node=>add(record,node,pulse('rotate(-7deg)','12px 12px'),280));break;
   case 'shield':
    if(name==='shield-check')move(parts.slice(1),0,-amount*.5);
    else add(record,parts[0],pulse('scale(.95)','12px 21px'),280);break;
   case 'bell':
    // bell-off draws the strike-through third; it stays still while the bell parts move.
    parts.forEach((node,i)=>{if(name==='bell-off'&&i===2)return;add(record,node,pulse(i===0?`rotate(${amount*7}deg)`:'translateX(1px)',i===0?'12px 4px':'12px 21px'),280)});break;
   case 'terminal':accent(record,parts[0]);move(parts.slice(1),amount*.65,0);break;
   case 'moon':parts.forEach(node=>add(record,node,pulse('rotate(-8deg)'),320));break;
   case 'sun':parts.filter(node=>node.localName==='path').forEach(node=>add(record,node,pulse('rotate(12deg)'),320));break;
   case 'indicator':
    // Emphasise the existing ring without changing fill, progress or status.
    parts.forEach(node=>accent(record,node));break;
   case 'frame':add(record,icon,pulse('scale(1.1)','center'),300);break;
   case 'brand':add(record,icon,[{opacity:1},{opacity:.7,offset:.35},{opacity:1}],320);break;
   case 'rain':
    [...icon.querySelectorAll('.window-rain path')].forEach((node,i)=>add(record,node,translatePulse(0,1.4),350,i%4*30));break;
   case 'conversation':
    [...icon.querySelectorAll('[data-icon-detail=chat-line]')].forEach((node,i)=>add(record,node,[
     {opacity:0,transform:'scaleX(.65)',transformOrigin:'7px 12px'},
     {opacity:.8,transform:'scaleX(1)',transformOrigin:'7px 12px',offset:.35},
     {opacity:.8,transform:'scaleX(1)',transformOrigin:'7px 12px',offset:.65},
     {opacity:0,transform:'scaleX(1)',transformOrigin:'7px 12px'},
    ],300,i*35));break;
   case 'grid':
    parts.forEach((node,i)=>{
     const b=node.getBBox(),x=Math.sign(b.x+b.width/2-12)*amount,y=Math.sign(b.y+b.height/2-12)*amount;
     add(record,node,pulse(`translate(${x}px,${y}px)`),280,i*18);
    });break;
   case 'search':
    parts.filter(node=>node.localName==='circle').forEach(node=>add(record,node,pulse('scale(1.055)',localOrigin(node)),280));break;
   case 'gear':
    parts.filter(node=>node.localName==='path').forEach(node=>add(record,node,pulse('rotate(30deg)'),320));break;
   case 'new-chat':
    add(record,parts[1],[
     {transform:'rotate(0deg)',transformOrigin:'18.5px 5.5px'},
     {transform:'rotate(76deg)',transformOrigin:'18.5px 5.5px',offset:.82},
     {transform:'rotate(90deg)',transformOrigin:'18.5px 5.5px'},
    ],340);break;
   case 'sliders':
    parts.filter(n=>n.localName==='circle'||/^M\s*[\d.]+[ ,]+[\d.]+v4$/i.test(n.getAttribute('d')||'')).forEach((node,i)=>
     add(record,node,pulse(`translateX(${i%2?-amount:amount}px)`),300));break;
   case 'arrow': {
    const x=/left|undo|ccw/.test(name)?-1.4:/right|log-out/.test(name)?1.4:0;
    // A corner arrow (Enter/return) points where the line ends: sideways only.
    const y=name.startsWith('corner-')?0:/up|upload/.test(name)?-1.4:/down|download/.test(name)?1.4:0;
    parts.forEach(n=>add(record,n,pulse(`translate(${x}px,${y}px)`),280));break;
   }
   case 'transfer': {
    // Keep the tray/door fixed; only the passing arrow carries the direction.
    const arrow=name==='download'?[parts[0],parts[2]]:parts.slice(0,2);
    const movement=name==='log-out'?'translateX(1.4px)':`translateY(${name==='upload'||name==='share'?-1.4:1.4}px)`;
    arrow.forEach(node=>add(record,node,pulse(movement),280));break;
   }
   case 'swap':
    parts.forEach(node=>{const b=node.getBBox();add(record,node,pulse(`translateX(${b.y+b.height/2<12?-amount:amount}px)`),280)});break;
   case 'return':
    parts.forEach(node=>add(record,node,pulse('rotate(-12deg)'),280));break;
   case 'expand':
    parts.forEach(node=>{
     if(node.localName==='rect'){add(record,node,pulse(`scale(${name==='shrink'?.92:1.1})`,localOrigin(node)),300);return}
     const b=node.getBBox(),sign=name==='shrink'?-1:1;
     const x=Math.sign(b.x+b.width/2-12)*amount*sign,y=Math.sign(b.y+b.height/2-12)*amount*sign;
     add(record,node,pulse(`translate(${x}px,${y}px)`),300);
    });break;
   case 'layers':
    parts.forEach((node,i)=>add(record,node,pulse(`translateY(${(i-(parts.length-1)/2)*amount}px)`),300));break;
   case 'image':
    if(name==='image-plus')parts.slice(0,2).forEach(n=>add(record,n,pulse('scale(1.13)','19px 5px'),300));
    else parts.filter(n=>n.localName==='circle').forEach(n=>add(record,n,pulse('scale(1.1)',localOrigin(n)),300));
    break;
   case 'sparkle':
    parts.forEach(n=>add(record,n,pulse('scale(1.09)',localOrigin(n)),320));break;
   case 'folder-plus':
    parts.slice(0,2).forEach(n=>add(record,n,pulse('scale(1.12)',name==='bookmark-plus'?'12px 10px':'12px 13px'),300));break;
   case 'copy':
    add(record,parts.find(n=>n.localName==='rect'),pulse('translate(.8px,-.8px)'),280);break;
   case 'coffee':
    [...icon.querySelectorAll('.coffee-steam')].forEach((node,i)=>{
     const opacity=Number(getComputedStyle(node).opacity);
     add(record,node,[
      {transform:'none',opacity},
      {transform:'translateY(-1.4px)',opacity:0,offset:.68},
      {transform:'none',opacity:0,offset:.76},
      {transform:'none',opacity},
     ],560,i*20);
    });break;
  }
  // New SVG shapes and compact native-shell variants still get a visible
  // finite response if they do not contain a recipe's expected detail nodes.
  if(!record.animations.length)parts.forEach(node=>accent(record,node));
  if(record.animations.length)record.watch();else record.clean();
 }
 function settle(record){
  if(record.done||record.settling)return;
  if(record.held){releasePress(record.host);return}
  record.settling=true;record.epoch++;
  const targets=record.targets.map(({node,end})=>{
   const style=getComputedStyle(node),start={};
   for(const key of Object.keys(end))if(key!=='offset')start[key]=style[key];
   return {node,start,end};
  });
  record.animations.forEach(a=>a.cancel());record.animations=[];
  targets.forEach(({node,start,end})=>{if(node.isConnected)record.animations.push(node.animate([start,end],{duration:120,easing:ease,fill:'none'}))});
  record.watch();
 }
 function enter(host,kind){
  if(!enabled(host))return;
  const icons=iconsFor(host);
  if(icons.length)host.dataset.iconMotionControl='';else delete host.dataset.iconMotionControl;
  const already=hovered.has(host)||focused.has(host);
  (kind==='hover'?hovered:focused).add(host);
  if(kind==='hover')host.dataset.iconMotionHover='';
  if(!already&&!reduced.matches)icons.forEach(icon=>play(icon,host));
 }
 function leave(host,kind){
  if(!host)return;(kind==='hover'?hovered:focused).delete(host);
  if(kind==='hover')delete host.dataset.iconMotionHover;
  if(!hovered.has(host)&&!focused.has(host))iconsFor(host).forEach(icon=>{const record=running.get(icon);if(record)settle(record)});
 }
 function press(host){
  if(!enabled(host)||!host.matches(interactive)||reduced.matches)return;
  const icons=iconsFor(host);
  if(!icons.length){delete host.dataset.iconMotionControl;return}
  host.dataset.iconMotionControl='';
  icons.forEach(icon=>{
   if(stateOnly(icon))return;
   const nodes=partsOf(icon),previous=pressing.get(icon);
   const starts=nodes.map(node=>getComputedStyle(node).scale);
   const bases=previous?.bases||new Map(nodes.map((node,i)=>[node,starts[i]==='none'?'1':starts[i]]));
   previous?.clean();
   const record=recordFor(icon,pressing),size=icon.getBoundingClientRect().width;
   record.host=host;record.held=true;record.bases=bases;
   const amount=size<=16||icon.closest(dense)||icon.closest('.destructive') ? .94 : .9;
   nodes.forEach((node,i)=>add(record,node,[{scale:starts[i]==='none'?'1':starts[i]},{scale:String(amount)}],90,0,'forwards'));
   if(!record.animations.length)record.clean();
  });
 }
 function releasePress(host){
  if(!host)return;
  iconsFor(host).forEach(icon=>{
   const record=pressing.get(icon);if(!record||!record.held)return;
   record.held=false;record.epoch++;
   const targets=record.targets.map(({node})=>({node,scale:getComputedStyle(node).scale}));
   record.animations.forEach(animation=>animation.cancel());record.animations=[];record.targets=[];
   for(const {node,scale} of targets)add(record,node,[{scale:scale==='none'?'1':scale},{scale:record.bases.get(node)||'1'}],140);
   if(record.animations.length)record.watch();else record.clean();
  });
 }
 function cancelTouch(){
  const host=touchPress?.host;touchPress=null;
  releasePress(host);
  if(host)iconsFor(host).forEach(icon=>{const record=running.get(icon);if(record)settle(record)});
 }
 document.addEventListener('pointerover',event=>{
  if(event.pointerType==='touch'||!hover.matches)return;
  const host=owner(event.target);if(host&&owner(event.relatedTarget)!==host)enter(host,'hover');
 });
 document.addEventListener('pointerout',event=>{
  // Touch emits pointerout immediately after pointerup despite never hovering.
  // Let its one-shot response finish; only a real hover exit should settle it.
  const host=owner(event.target);if(host&&hovered.has(host)&&owner(event.relatedTarget)!==host)leave(host,'hover');
  if(mousePress?.host===host&&owner(event.relatedTarget)!==host){releasePress(host);mousePress=null}
 });
 document.addEventListener('focusin',event=>{const host=owner(event.target);if(host&&event.target.matches(':focus-visible')&&owner(event.relatedTarget)!==host)enter(host,'focus')});
 document.addEventListener('focusout',event=>{const host=owner(event.target);if(host&&owner(event.relatedTarget)!==host){leave(host,'focus');if(keyPress?.host===host){releasePress(host);keyPress=null}}});
 // Press tracks contact; the semantic one-shot waits for an unmoved release.
 // A scroll/cancel must never look like an activated button or latch hover.
 const trackTouch=event=>{
  if(touchPress?.id===event.pointerId&&Math.hypot(event.clientX-touchPress.x,event.clientY-touchPress.y)>8)cancelTouch();
 };
 document.addEventListener('pointerdown',event=>{
  const host=owner(event.target),touch=event.pointerType==='touch'||event.pointerType==='pen';
  if(host)focused.delete(host);
  if(touch){
   touchPointers.add(event.pointerId);
   for(const prior of hovered)leave(prior,'hover');
   if(touchPointers.size!==1){cancelTouch();return}
   if(event.button===0&&event.isPrimary!==false&&enabled(host)){
    touchPress={id:event.pointerId,host,x:event.clientX,y:event.clientY};press(host);
   }
   return;
  }
  cancelTouch();
  if(event.button===0){mousePress={id:event.pointerId,host};press(host)}
 },{passive:true,capture:true});
 document.addEventListener('pointermove',trackTouch,{passive:true,capture:true});
 document.addEventListener('pointerup',event=>{
  trackTouch(event);touchPointers.delete(event.pointerId);
  if(touchPress?.id===event.pointerId){
   const host=touchPress.host;touchPress=null;releasePress(host);
   const hit=document.elementFromPoint(event.clientX,event.clientY);
   if(enabled(host)&&(owner(event.target)===host||owner(hit)===host))iconsFor(host).forEach(icon=>play(icon,host));
  }
  if(mousePress?.id===event.pointerId){releasePress(mousePress.host);mousePress=null}
 },{passive:true,capture:true});
 document.addEventListener('pointercancel',event=>{
  touchPointers.delete(event.pointerId);if(touchPress?.id===event.pointerId)cancelTouch();
  if(mousePress?.id===event.pointerId){releasePress(mousePress.host);mousePress=null}
  leave(owner(event.target),'hover');
 },{passive:true,capture:true});
 document.addEventListener('lostpointercapture',event=>{
  if(touchPress?.id===event.pointerId)cancelTouch();
  if(mousePress?.id===event.pointerId){releasePress(mousePress.host);mousePress=null}
 },{passive:true,capture:true});
 document.addEventListener('click',event=>{
  // Opening a modal or replacing a control can suppress pointerout. Reconcile
  // actual hit testing after React updates, so its old hover marker cannot stick.
  if(!hovered.size)return;
  if(hoverFrame)cancelAnimationFrame(hoverFrame);
  const {clientX:x,clientY:y}=event;
  hoverFrame=requestAnimationFrame(()=>{
   hoverFrame=0;const hit=owner(document.elementFromPoint(x,y));
   for(const prior of hovered)if(!prior.isConnected||prior!==hit)leave(prior,'hover');
  });
 },{passive:true,capture:true});
 document.addEventListener('keydown',event=>{
  const target=event.target;
  if(target instanceof Element&&target.closest('input,textarea,select,[contenteditable]:not([contenteditable=false])'))return;
  if(!event.repeat&&(event.key==='Enter'||event.key===' ')){
   const host=owner(target);keyPress={key:event.key,host};press(host);
  }
 });
 document.addEventListener('keyup',event=>{
  if(keyPress?.key!==event.key)return;
  const host=keyPress.host;keyPress=null;releasePress(host);
  if(enabled(host))iconsFor(host).forEach(icon=>play(icon,host));
 });
 const stop=()=>{touchPress=null;mousePress=null;keyPress=null;touchPointers.clear();if(hoverFrame)cancelAnimationFrame(hoverFrame);hoverFrame=0;[...active].forEach(record=>record.clean());for(const host of hovered)delete host.dataset.iconMotionHover;hovered.clear();focused=new WeakSet()};
 // React can replace an icon or disable its owner between contact and release.
 // Held animations must not retain detached nodes or leave disabled controls down.
 new MutationObserver(()=>{
  for(const record of active)if(!record.icon.isConnected||!enabled(record.host)||stateOnly(record.icon))record.clean();
  for(const host of hovered)if(!host.isConnected||!enabled(host))leave(host,'hover');
  if(touchPress&&!enabled(touchPress.host))cancelTouch();
 }).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','aria-disabled','data-disabled','hidden','inert']});
 reduced.addEventListener('change',()=>{if(reduced.matches)stop()});
 hover.addEventListener('change',()=>{if(!hover.matches)for(const host of hovered)leave(host,'hover')});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
 window.addEventListener('blur',stop);window.addEventListener('pagehide',stop);
})();
