import {DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator} from './ui/dropdown-menu';
import {PreparedContentCache} from '../preparedContent';
import {answerUsage} from '../answerUsage';
import {highlightSearch,SearchHighlightContext,matchParts} from '../chatSearch';
import {HintLink} from './Hint';
import {Fragment,memo,useCallback,useEffect,useLayoutEffect,useRef,useState,useId,useMemo,useContext,type ReactNode} from 'react';
import {MarkdownBlocks,type MarkdownBlock} from '../markdownBlocks';
import {MessageMutationControls,chatMutationLocked} from './MessageMutationControls';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {standaloneMath,tableMathPipes} from '../markdownMath';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {GitBranch,ChartNoAxesColumn,ChevronLeft,ChevronRight,Globe,Loader2,Pencil,RotateCcw,X,Check,BookOpen} from '../icons';
import {Avatar,Button,CopyButton,Disclosure,IconButton} from './primitives';
import {ChatImages} from './ChatImages';
import {MarkdownImage,WebImagesContext} from './WebImage';
import {webImageCopyText} from '../webImages';
import {ChatSuggestions} from './ChatSuggestions';
import {DeleteMessageAction} from './DeleteMessageAction';
import {PinMessage} from './ChatContextPanel';
import {AttachmentImages} from './AttachmentImages';
import {ResponseActivity} from './ResponseActivity';
import {AnswerMoreActions} from './AnswerMoreActions';
import {ActivityGlyph,ActivityIndicator,type ActivityState} from './ActivityIndicator';
import {toolActivity,toolKind,toolLabel} from '../toolActivity';
import {WebToolDetails} from './WebToolDetails';
import {useStatsScroll} from './useStatsScroll';
import {RevealRegion} from './Reveal';
import {CodeBlock} from './CodeBlock';
import {SyntaxCode as Code} from './SyntaxCode';
import {VariantTransition} from './VariantTransition';
import {motionEase} from '../motion';
import './AnswerStream.css';
import {MessageEntrance,useMessageEntrance} from './MessageEntrance';
import {useSmoothAnswer} from '../useSmoothAnswer';
import {sentMessageMotion,finishMessageMotion} from '../messageMotion';
import {sourceCitations} from '../citations';
import {announce} from '../announce';
import {responseStatus,responseOutcome} from '../responseStatus';
import {streamReveal} from '../streamReveal';
import {AnswerSources,AnswerSourcesContext} from './AnswerSources';
import {forkBranch,chooseVariant,editMessage,regenerate,failure,currentChat,useChatSelection} from '../store';
import {safeUrl,modelName} from '../domain';
import type {Message,Live,Values,Metrics,ToolEvent,GeneratedImage} from '../types';
import './AnswerHeading.css';
import './AnswerFooter.css';
import 'katex/dist/katex.min.css';
import './AnswerMath.css';
function RevealSpan({node,children,style,...props}:any){
 const born=props['data-reveal-born'],offset=props['data-reveal-offset'];
 // Freeze delay for this word. Updating a running CSS animation's delay on
 // each token would advance its timeline twice and make the reveal jump.
 const delay=useMemo(()=>born==null?undefined:`-${Math.max(0,performance.now()-Number(born))}ms`,[born,offset]);
 return <span {...props} style={delay?{...style,animationDelay:delay}:style}>{children}</span>;
}
function MarkdownLink({href,children,className,title,node}:any){
 const sources=useContext(AnswerSourcesContext),index=Number(node?.properties?.['data-source-index']??(sources?.findIndex(s=>s.url===href)??-1));
 if(className?.split(' ').includes('source-citation')&&sources&&index>=0){const indices=String(node?.properties?.['data-source-indices']??index).split(',').map(Number);return <AnswerSources sources={sources} index={index} indices={indices} inline/>}
 return <HintLink className={className} hint={title} href={safeUrl(href||'')} target="_blank" rel="noopener noreferrer">{children}</HintLink>;
}
const markdownComponents={span:RevealSpan,pre:CodeBlock,code:Code,a:MarkdownLink,table:({children}:any)=><div className="table-scroll"><table>{children}</table></div>,img:MarkdownImage};
export const preparedMarkdown=new PreparedContentCache<ReactNode>();
export const Markdown=memo(function Markdown({text,streaming=false,sources,webImages,cacheKey}:{text:string;streaming?:boolean;sources?:Message['sources'];webImages?:Message['web_images'];cacheKey?:object}){
 const searchQuery=useContext(SearchHighlightContext);
 const reduced=useReducedMotion(),blocks=useRef(new MarkdownBlocks());
 const savedCacheKey=streaming?undefined:cacheKey;
 const settled=useRef(new WeakMap<MarkdownBlock,{sources:Message['sources'];query:string;tree:ReactNode}>());
 const seenStarts=useRef(new Set<number>()),lastText=useRef('');
 const prepared=useMemo(()=>{
  const create=()=>{
   if(!text.startsWith(lastText.current))seenStarts.current.clear();lastText.current=text;const parts=blocks.current.update(text),query=streaming&&!reduced?'':searchQuery;
   return parts.map((part,index)=>{
    const active=streaming&&!reduced&&index===parts.length-1,previous=settled.current.get(part);
    if(!active&&previous&&previous.sources===sources&&previous.query===query)return previous.tree;
    const plugins=active?[sourceCitations(sources)]:[sourceCitations(sources),highlightSearch(query)];
    const shouldAnimate=streaming&&!reduced&&part.start>0&&!seenStarts.current.has(part.start);if(streaming&&!reduced)seenStarts.current.add(part.start);const blockClass=shouldAnimate?'stream-block stream-block-enter':'stream-block';
    const tree=<div key={part.start} className={blockClass} onAnimationEnd={shouldAnimate?(e)=>{e.currentTarget.classList.remove('stream-block-enter')}:undefined}>{ReactMarkdown({children:part.text,remarkPlugins:[remarkGfm,remarkMath,tableMathPipes],rehypePlugins:[standaloneMath,[rehypeKatex,{trust:false,strict:'ignore',errorColor:'inherit',maxSize:20,maxExpand:1000}],...plugins],components:markdownComponents})}</div>;
    if(!active)settled.current.set(part,{sources,query,tree});
    return tree;
   });
  };
  // Cache the prepared React tree for the entire saved document as before.
  // During streaming, settled blocks keep their tree; only the tail is parsed.
  return savedCacheKey&&!searchQuery?preparedMarkdown.prepare(savedCacheKey,text,sources,create):create();
 },[savedCacheKey,text,sources,streaming,searchQuery,reduced]);
 return <WebImagesContext.Provider value={webImages}><AnswerSourcesContext.Provider value={sources}>{prepared}</AnswerSourcesContext.Provider></WebImagesContext.Provider>;
});
const footerItem={hidden:{opacity:0,y:4},shown:{opacity:1,y:0}};
function Stats({metrics,actions}:{metrics:Metrics;actions:ReactNode}){const[open,setOpen]=useState(false),detailsId=useId(),reduced=useReducedMotion(),statsScroll=useStatsScroll();const items:[string,string][]=[];const approximate=metrics.estimated===false?'':'≈ ';
 if(metrics.responseTokens!=null)items.push(['Токены ответа',(metrics.responseEstimated?'≈ ':'')+metrics.responseTokens]);if(metrics.reasoningTokens)items.push(['Рассуждения',(metrics.reasoningEstimated?'≈ ':'')+metrics.reasoningTokens]);if(metrics.tokens!=null)items.push(['Всего сгенерировано',approximate+metrics.tokens]);if(metrics.speed!=null&&metrics.speed>0)items.push(['Скорость',`${approximate}${metrics.speed} ток/с`]);if(metrics.duration!=null)items.push(['Время',`${metrics.duration} с`]);if(metrics.ttft!=null)items.push(['Первый токен',`${metrics.ttft.toFixed(2)} с`]);if(metrics.promptTokens!=null)items.push(['Контекст запроса',`${metrics.promptEstimated?'≈ ':''}${metrics.promptTokens}${metrics.contextSize?` / ${metrics.contextSize}`:''} ток.`]);if(metrics.stopped)items.push(['Завершение','Остановлено']);if(metrics.finishReason==='length')items.push(['Завершение','Лимит токенов']);
 const summary=[metrics.speed!=null&&metrics.speed>0?`${approximate}${Number(metrics.speed.toFixed(1))} ток/с`:null,metrics.duration!=null?`${metrics.duration} с`:null].filter(Boolean).join(' · ');
 return <div ref={statsScroll.root} className="answer-footer"><div className="answer-footer-row">{actions}<button className="stats-trigger" aria-label="Статистика ответа" aria-expanded={open} aria-controls={detailsId}  onClick={()=>{statsScroll.begin(!open);setOpen(v=>!v)}}><ChartNoAxesColumn size={14}/><span className="stats-full">{summary||'Статистика'}</span><span className="stats-compact">{metrics.speed!=null&&metrics.speed>0?`${approximate}${Number(metrics.speed.toFixed(1))} ток/с`:metrics.duration!=null?`${metrics.duration} с`:'Статистика'}</span><ChevronRight size={12} className={open?'rotated':''}/></button></div><AnimatePresence initial={false}>{open&&<RevealRegion key="details" id={detailsId} role="region" aria-label="Статистика ответа" className="stats-details" onComplete={statsScroll.finish}><motion.div className="stats-details-body" initial="hidden" animate="shown" exit="hidden" variants={{hidden:{opacity:0,y:-4},shown:{opacity:1,y:0,transition:{delayChildren:reduced?0:.02,staggerChildren:reduced?0:.02}}}} transition={{duration:reduced?0:.2,ease:[.23, 1, .32, 1]}}><div className="stats-grid">{items.map(([k,v])=><motion.div key={k} variants={footerItem} transition={{duration:reduced?0:.22}}><span>{k}</span><strong>{v}</strong></motion.div>)}</div></motion.div></RevealRegion>}</AnimatePresence></div>;
}
function Tools({events,images=[],phase,sources,stopping=false}:{events:ToolEvent[];images?:GeneratedImage[];phase?:string;sources?:Message['sources'];stopping?:boolean}){
 const summary=toolActivity(events);
 const currentImage=images.findLast(image=>['queued','preparing','generating'].includes(image.status))||images.at(-1);
 const imagePhase=phase||({queued:'Ожидает очереди…',preparing:'Освобождение памяти LLM…',generating:'Сэмплирование в ComfyUI…',done:'Завершение работы ComfyUI…'} as Record<string,string>)[currentImage?.status||'']||'Подготовка генерации…';
 const label=summary.kind==='image'&&summary.state==='running'?(events.findLast(event=>event.status==='running')?.name==='edit_image'?'Изменение изображения':'Создание изображения'):summary.label;
 return <Disclosure busy={summary.state==='running'&&!stopping} className={`tools-disclosure ${summary.kind==='search'?'search-activity':''}`} title={<ActivityIndicator kind={summary.kind} state={summary.state} label={label} meta={summary.meta} paused={stopping}/>}><ol className="tool-timeline">{events.map(event=>{
  const state:ActivityState=event.status==='running'?'running':event.status==='error'?'error':event.status==='cancelled'||event.status==='stopped'?'cancelled':'completed';
  if(toolKind(event.name)==='image')return <li key={event.id} data-state={state} className="tool-image-detail"><header><strong>ComfyUI</strong>{event.duration_ms!=null&&<small>{(event.duration_ms/1000).toFixed(1)} с</small>}</header><p className="tool-image-stage">{state==='running'?(stopping?'Останавливается…':imagePhase):state==='cancelled'?'Остановлено':state==='error'?'Ошибка':'Готово'}</p>{event.error&&<p className="error-text">{event.error}</p>}</li>;
  return <li key={event.id} data-state={state}><ActivityGlyph kind={toolKind(event.name)} state={state} paused={stopping}/><div><header><strong>{toolLabel(event.name)}</strong><small className={state==='running'&&!stopping&&event.duration_ms==null?'activity-shimmer':undefined}>{event.duration_ms!=null?`${(event.duration_ms/1000).toFixed(1)} с`:state==='running'?(stopping?'Останавливается…':'Выполняется…'):state==='cancelled'?'Остановлено':state==='error'?'Ошибка':'Готово'}</small></header>{event.query?<p>{event.query}</p>:event.url?<a href={safeUrl(event.url)} target="_blank" rel="noopener noreferrer">{event.url}</a>:null}{event.result_count!=null&&<small className="tool-result-count">{(event.name==='generate_image'||event.name==='edit_image')?'Изображений':event.name==='remember_memory'||event.name==='forget_memory'?'Изменений':'Найдено'}: {event.result_count}</small>}<WebToolDetails event={event} sources={sources}/>{event.error&&<p className="error-text">{event.error}</p>}{event.initiator==='system'&&<small className="tool-initiator">Запущено приложением · режим «Всегда»</small>}</div></li>;
 })}</ol>{images.map(image=><dl key={image.id} className="tool-image-parameters" aria-label="Параметры изображения"><div><dt>Размер</dt><dd>{image.width} × {image.height}</dd></div>{image.steps!=null&&<div><dt>Шаги</dt><dd>{image.steps}</dd></div>}{image.model&&<div><dt>Модель</dt><dd>{image.model}</dd></div>}{image.seed!=null&&<div><dt>Seed</dt><dd>{image.seed}</dd></div>}</dl>)}</Disclosure>;
}
export type MessagePresentation='history'|'new-user'|'new-live'|'restored';
const enteredAnswers=new Set<string>();
/** Shared by the sent question and its answer row so they read as one block. */
const SEND_RISE_PX=8,SEND_RISE_MS=220,SEND_ANSWER_DELAY_MS=50;
type MessageProps={presentation?:MessagePresentation;message:Message;settings:Values;live?:Live;locked?:boolean;showSuggestions?:boolean;nextUser?:boolean;last?:boolean;onProfile?:(model:string)=>void};
// Subscribe at the row that owns the stream. The same component/key survives
// completion and variant regeneration, preserving buffered reveal and controls.
export const StreamingMessageView=memo(function StreamingMessageView({message,live:layoutLive,...props}:MessageProps){
 const live=useChatSelection(state=>layoutLive?state.lives[layoutLive.chat_id]:undefined);
 const shown=useMemo(()=>live?{...message,content:live.text||'',reasoning:live.reasoning,model:live.model||message.model,tool_events:live.tool_events,generated_images:live.generated_images,web_images:live.web_images,sources:live.sources}:message,[message,live]);
 const stage=responseStatus(shown,live)?.current.label||'',outcome=responseOutcome(message).reason;
 // Announce semantic stages outside aria-busy. Tokens and restored history stay quiet.
 const streaming=useRef<{chatId:string;stage:string;stopping:boolean}|null>(null);
 useEffect(()=>{
  if(live?.restored){streaming.current=null;return}
  if(live){
   if(streaming.current?.chatId!==live.chat_id||streaming.current.stage!==stage)announce(stage);
   streaming.current={chatId:live.chat_id,stage,stopping:!!live.stopping};return;
  }
  if(streaming.current){announce(responseOutcome(message,streaming.current.stopping).label);streaming.current=null}
 },[live?.chat_id,live?.restored,live?.stopping,stage,outcome]);
 return <MessageView {...props} message={shown} live={live}/>;
});
export const MessageView=memo(function MessageView({message,settings,live,presentation,locked=false,showSuggestions=false,nextUser=false,last=false,onProfile}:MessageProps){
 const searchQuery=useContext(SearchHighlightContext);
 const [sentOrigin,setSentOrigin]=useState(()=>message.role==='user'&&presentation!=='history'&&presentation!=='restored'?sentMessageMotion(message.id):null);
 const restoredStream=presentation==='restored'||!!live?.restored;
 const freshLiveSeen=useRef(false);if(live&&!restoredStream)freshLiveSeen.current=true;
 const editorOpened=useRef(false);
 const[expanded,setExpanded]=useState(false),[editing,setEditing]=useState(false),[text,setText]=useState(message.content),[saving,setSaving]=useState(false),reduced=useReducedMotion();
 const entrance=useRef<HTMLElement>(null);
 // Send motion is one gesture: the list is already at its final position before
 // the first paint (App pins it to the bottom), and only the new question and
 // the fresh answer row rise in together. No flying copy, no animated scroll.
 useMessageEntrance(entrance,!!sentOrigin,reduced,SEND_RISE_PX,SEND_RISE_MS,()=>{if(sentOrigin){finishMessageMotion(message.id);setSentOrigin(null)}});
 const answerRow=useRef<HTMLElement>(null);
 const [enterAnswer]=useState(()=>message.role==='assistant'&&!!live&&!restoredStream&&!message.content&&!enteredAnswers.has(message.id));
 useLayoutEffect(()=>{
  const element=answerRow.current;if(!enterAnswer||reduced||!element||typeof element.animate!=='function')return;
  // A row that remounts under another wrapper must not fade in a second time.
  enteredAnswers.add(message.id);if(enteredAnswers.size>50)enteredAnswers.delete(enteredAnswers.values().next().value!);
  const animation=element.animate([{opacity:0,transform:`translate3d(0,${SEND_RISE_PX}px,0)`},{opacity:1,transform:'none'}],{duration:SEND_RISE_MS,delay:SEND_ANSWER_DELAY_MS,easing:'cubic-bezier(.23,1,.32,1)',fill:'backwards'});
  return()=>animation.cancel();
 },[enterAnswer,reduced]);
 const editorInput=useRef<HTMLTextAreaElement>(null);
 const questionBubble=useRef<HTMLDivElement>(null);
 const toggleExpanded=()=>setExpanded(value=>!value);
 const openEditor=()=>{
  if(chatMutationLocked())return;
  editorOpened.current=true;setText(message.content);setEditing(true);
 };
 const editorTransition={opacity:{duration:reduced?0:.15,ease:motionEase},y:{duration:reduced?0:.2,ease:motionEase}};
 const focusEditor=useCallback((node:HTMLTextAreaElement|null)=>{editorInput.current=node;if(node){node.focus({preventScroll:true});node.setSelectionRange(node.value.length,node.value.length)}},[]);
 const [switching,setSwitching]=useState(false),[forking,setForking]=useState(false);
 const forkHere=async()=>{if(forking||chatMutationLocked())return;setForking(true);try{await forkBranch(message.id)}catch(error){failure(error)}finally{setForking(false)}};
 const forkButton=<IconButton label="Создать ветку отсюда" disabled={locked||forking} onClick={()=>void forkHere()}>{forking?<Loader2 size={14} className="spin"/>:<GitBranch size={14}/>}</IconButton>;
 const regenerateHere=async()=>{if(saving||chatMutationLocked())return;setSaving(true);try{await regenerate(message)}catch(e){failure(e)}finally{setSaving(false)}};
 const variantsControl=useRef<HTMLSpanElement>(null),variantAnchorTop=useRef<number|null>(null),variantPendingScroll=useRef<{node:HTMLElement;listener:()=>void}|null>(null),previousVariantIndex=useRef<number|undefined>(undefined);
 useEffect(()=>()=>{const pending=variantPendingScroll.current;if(pending)pending.node.removeEventListener('scroll',pending.listener);const scroll=variantsControl.current?.closest<HTMLElement>('.message-scroll');if(scroll)delete scroll.dataset.variantAnchoring},[]);
 const switchVariant=async(nextIndex:number)=>{if(switching||chatMutationLocked())return;const control=variantsControl.current,scroll=control?.closest<HTMLElement>('.message-scroll'),oldPending=variantPendingScroll.current;if(oldPending)oldPending.node.removeEventListener('scroll',oldPending.listener);variantAnchorTop.current=control?.getBoundingClientRect().top??null;if(control&&scroll){const trackScroll=()=>{if(control.isConnected)variantAnchorTop.current=control.getBoundingClientRect().top};scroll.addEventListener('scroll',trackScroll,{passive:true});variantPendingScroll.current={node:scroll,listener:trackScroll};window.dispatchEvent(new CustomEvent('chat-variant-switch-start',{detail:{chatId:currentChat()?.id}}))}setSwitching(true);try{await chooseVariant(message,nextIndex)}catch(e){const pending=variantPendingScroll.current;if(pending)pending.node.removeEventListener('scroll',pending.listener);variantPendingScroll.current=null;variantAnchorTop.current=null;failure(e)}finally{setSwitching(false)}};
 const [loadingAnimation,setLoadingAnimation]=useState(false);
 useEffect(()=>{
  if(live?.phase!=='Загрузка модели…'||!live.chat_id){setLoadingAnimation(false);return}
  const key=`llm-loading-shown-${live.chat_id}`;
  try{if(sessionStorage.getItem(key)){setLoadingAnimation(false);return}sessionStorage.setItem(key,'true')}catch{}
  setLoadingAnimation(true);
 },[live?.phase,live?.chat_id]);
 const variants=message.variants||[],index=Math.max(0,Math.min(message.current_variant_index??variants.length-1,variants.length-1));
 useLayoutEffect(()=>{
  const previous=previousVariantIndex.current;previousVariantIndex.current=index;
  if(previous==null||previous===index)return;
  const pending=variantPendingScroll.current;if(pending)pending.node.removeEventListener('scroll',pending.listener);variantPendingScroll.current=null;
  const targetTop=variantAnchorTop.current;variantAnchorTop.current=null;
  const control=variantsControl.current,scroll=control?.closest<HTMLElement>('.message-scroll'),row=control?.closest<HTMLElement>('.assistant-message');
  if(targetTop==null||!control||!scroll||!row)return;
  const adjust=()=>{if(!control.isConnected)return;const target=variantAnchorTop.current??targetTop,drift=control.getBoundingClientRect().top-target;if(Math.abs(drift)>.5)scroll.scrollTop+=drift};
  let disposed=false,timer=0;
  const observer=new ResizeObserver(adjust);observer.observe(row);adjust();
  const stop=()=>{if(disposed)return;disposed=true;observer.disconnect();window.clearTimeout(timer);scroll.removeEventListener('wheel',stop);scroll.removeEventListener('touchstart',stop);scroll.removeEventListener('pointerdown',stop);delete scroll.dataset.variantAnchoring};
  scroll.dataset.variantAnchoring='true';
  scroll.addEventListener('wheel',stop,{once:true,passive:true});scroll.addEventListener('touchstart',stop,{once:true,passive:true});scroll.addEventListener('pointerdown',stop,{once:true,passive:true});
  timer=window.setTimeout(stop,reduced?80:420);
  return stop;
 },[index,reduced]);
 const {text:content,revealing}=useSmoothAnswer(message.content,'answer',message.role==='assistant'&&!!live&&!restoredStream,!!reduced||message.role==='user'||restoredStream,!!message.model?.startsWith('google-subscription/'));
 const isLong=message.content.length>700||message.content.split('\n').length>10;
 const save=async()=>{if(saving||chatMutationLocked()||(!text.trim()&&!message.attachments?.length))return;setSaving(true);try{await editMessage(message,text);setEditing(false)}catch(e){failure(e)}finally{setSaving(false)}};
 if(message.role==='user')return <article ref={entrance} className="message user-message" data-message-id={message.id} data-next-user={nextUser||undefined} data-last-message={last||undefined}>
  {editing?<motion.div key="editor" className="message-editor-presence" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={editorTransition}><div className="message-editor"><textarea ref={focusEditor} aria-label="Изменить сообщение" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'&&!saving){e.preventDefault();setEditing(false)}if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void save()}}}/><small>Прежнее продолжение сохранится в отдельной ветке. Ctrl / ⌘ + Enter — отправить.</small><div><Button variant="ghost" onClick={()=>setEditing(false)} disabled={saving}>Отмена</Button><MessageMutationControls><Button onClick={()=>void save()} disabled={saving||locked}>{saving?<Loader2 className="spin"/>:'Отправить заново'}</Button></MessageMutationControls></div></div></motion.div>:<motion.div key="question" className="question-stack" initial={editorOpened.current&&!reduced?{opacity:0,y:-4}:false} animate={{opacity:1,y:0}} transition={editorTransition}><motion.div ref={questionBubble} className={`question-bubble ${isLong&&!expanded?'clamped':''}`} initial={false} animate={{scale:1}} style={{transformOrigin:"bottom right"}} transition={{duration:reduced?0:.22,ease:[.23, 1, .32, 1]}}>{!!message.attachments?.length&&<AttachmentImages attachments={message.attachments}/>}<div className="question-text">{searchQuery?matchParts(message.content,searchQuery).map((part,i)=>part.match?<mark className="search-highlight" key={i}>{part.text}</mark>:<span key={i}>{part.text}</span>):message.content}</div>{isLong&&<button className="expand-question" aria-expanded={expanded} onClick={toggleExpanded}>{expanded?'Свернуть':'Показать полностью'}<ChevronRight size={12}/></button>}</motion.div><div className="question-actions"><time>{new Date(message.timestamp).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time><CopyButton text={webImageCopyText(message.content,message.web_images)} label="Скопировать сообщение"/><MessageMutationControls><IconButton label="Редактировать сообщение" disabled={locked} onClick={openEditor}><Pencil size={14}/></IconButton>{forkButton}<PinMessage messageId={message.id} disabled={locked||saving}/><DeleteMessageAction messageId={message.id} disabled={locked||saving}/></MessageMutationControls></div></motion.div>}
 </article>;
 const name=modelName(message.model||'',settings);
 const outcome=responseOutcome(message);
 const actions=<div className="answer-actions">
  <span className="answer-action-slot"><CopyButton text={webImageCopyText(message.content,message.web_images)} label="Скопировать ответ"/></span>
  <MessageMutationControls>
   <span className="answer-action-slot"><IconButton label="Сгенерировать заново" disabled={locked||saving||switching} onClick={()=>void regenerateHere()}><RotateCcw size={14} className={saving?'spin':undefined}/></IconButton></span>
   <span className="answer-action-slot">{forkButton}</span>
  </MessageMutationControls>
  <span ref={variantsControl} className="answer-action-slot"><AnswerMoreActions messageId={message.id} text={webImageCopyText(message.content,message.web_images)} disabled={saving||switching||forking} speechAllowed={!currentChat()?.temporary}>
   {variants.length>1&&<><DropdownMenuSeparator/><DropdownMenuLabel>Вариант {index+1} из {variants.length}</DropdownMenuLabel><DropdownMenuItem disabled={index<=0||locked||switching} onSelect={()=>void switchVariant(index-1)}><ChevronLeft size={14}/>Предыдущий вариант</DropdownMenuItem><DropdownMenuItem disabled={index>=variants.length-1||locked||switching} onSelect={()=>void switchVariant(index+1)}><ChevronRight size={14}/>Следующий вариант</DropdownMenuItem><DropdownMenuSeparator/></>}
  </AnswerMoreActions></span>
 </div>;
 return <article ref={answerRow} className={`message assistant-message answer-refined ${live?'live-message':''}`} data-message-id={message.id} data-next-user={nextUser||undefined} data-last-message={last||undefined} aria-busy={!!live}>
  <button type="button" className="answer-heading" aria-label={`Настройки модели ${name}`} disabled={!message.model||!onProfile} onClick={()=>{if(message.model)onProfile?.(message.model)}}><Avatar src={settings.modelProfiles?.[message.model||'']?.avatar} name={name}/><span>{name}</span></button>
  <ResponseActivity message={message} live={live} loading={loadingAnimation&&!content}/>
  {!!message.tool_events?.length&&<Tools events={message.tool_events} images={message.generated_images} phase={live?.phase} sources={message.sources} stopping={!!live?.stopping}/>}
  {!!message.generated_images?.length&&<ChatImages images={message.generated_images} phase={live?.phase} animateEntry={!!live&&!restoredStream} eager={!!live}/> }
  <AnimatePresence initial={false}>{!!content&&<MessageEntrance key="answer" className="answer-content-presence" enter={(!!live&&!restoredStream)||revealing} distance={3}><VariantTransition variantKey={String(index)} live={!!live||revealing}><div className="prose answer-content"><Markdown text={content} cacheKey={message} streaming={(!!live&&!restoredStream)||revealing} sources={message.sources} webImages={message.web_images}/></div></VariantTransition></MessageEntrance>}</AnimatePresence>
  {!!message.sources?.length&&<div className="answer-sources-anchor"><AnswerSources sources={message.sources}/></div>}
  {!live&&message.metrics?.error&&<p className="inline-error">{message.metrics.error}</p>}
  {!live&&(outcome.reason==='stopped'||outcome.reason==='length')&&(!!message.content||!message.generated_images?.length)&&<div className="answer-result" data-result={outcome.reason}><ActivityIndicator kind={outcome.reason==='stopped'?'stopping':'processing'} state={outcome.reason==='stopped'?'cancelled':'completed'} label={outcome.label}/></div>}
  <AnimatePresence initial={false}>{!live&&!revealing&&<motion.div key="footer" className="answer-footer-presence" initial={freshLiveSeen.current&&!reduced?"hidden":false} animate="shown" exit="hidden" variants={{hidden:{opacity:0},shown:{opacity:1}}} transition={{duration:reduced?0:.15}}>{message.metrics?<Stats key={message.id} metrics={answerUsage(message)} actions={actions}/>:<div className="answer-footer"><div className="answer-footer-row">{actions}</div></div>}</motion.div>}</AnimatePresence>
  <ChatSuggestions messageId={message.id} items={message.suggestions} visible={showSuggestions&&settings.chatSuggestions!==false&&!live&&!revealing&&!locked&&!message.metrics?.error&&!message.metrics?.stopped}/>
 </article>;
});
