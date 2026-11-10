import {useEffect,useRef,useState} from 'react';
import {Bookmark,BookmarkPlus,Check,ChevronDown,MoreHorizontal,Pencil,RefreshCw,Trash2,Loader2,X} from '../icons';
import {api,notify} from '../store';
import {pollVisible} from '../visiblePolling';
import {useSnapshotState} from '../useSnapshotState';
import {Select,SelectOption} from './Select';
import {Button,IconButton,Modal} from './primitives';
import {StateTransition} from './StateTransition';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuTrigger} from './ui/dropdown-menu';
import {imageModelName,imageModelAlignment} from './imageModels';
import type {ImageDraft} from './useImageDraft';
import './StudioRecipes.css';

type Recipe={id:string;name:string;values:ImageDraft;version:number;created:number;updated:number};
type Editor={mode:'create'|'update'|'rename'|'delete';id:string;recipe?:Recipe;draft:ImageDraft};

function recipeValues(draft:ImageDraft,seed:string):ImageDraft{
 const [width,height]=draft.size==='custom'?[Number(draft.width),Number(draft.height)]:draft.size.split('x').map(Number);
 return {prompt:draft.prompt,negative:draft.negative,model:draft.model,sampler:draft.sampler,scheduler:draft.scheduler||'normal',denoise:draft.denoise??1,size:draft.size,width,height,steps:draft.steps,cfg:draft.cfg,seed,loras:draft.loras.map(lora=>({name:lora.name,strength:lora.strength,strength_clip:lora.strength_clip??null}))};
}
function validateRecipe(values:ImageDraft){
 if(!values.model.trim()||!values.sampler.trim())return 'Выберите модель и семплер.';
 if(![values.width,values.height].every(n=>Number.isInteger(n)&&Number(n)>=256&&Number(n)<=4096&&Number(n)%imageModelAlignment(values.model)===0))return 'Проверьте разрешение изображения.';
 if(!Number.isInteger(values.steps)||values.steps<1||values.steps>80)return 'Шаги: целое число от 1 до 80.';
 if(!Number.isFinite(values.cfg)||values.cfg<0||values.cfg>20)return 'CFG должен быть от 0 до 20.';
 if(!Number.isFinite(values.denoise)||Number(values.denoise)<0||Number(values.denoise)>1)return 'Denoise должен быть от 0 до 1.';
 return '';
}

// compact: the phone studio shows presets as one chip in the composer's chip row;
// choosing, saving and editing live in its menu instead of a separate row of controls.
export function StudioRecipes({draft,ready,userId,loop,onApply,compact=false}:{draft:ImageDraft;ready:boolean;userId:string;loop:boolean;onApply:(values:ImageDraft)=>Promise<void>;compact?:boolean}){
 const [recipes,setRecipes]=useSnapshotState<Recipe[]>([]),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[applyError,setApplyError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState('');
 const [editor,setEditor]=useState<Editor|null>(null),[name,setName]=useState(''),[fixed,setFixed]=useState(false),[seed,setSeed]=useState(''),[editError,setEditError]=useState('');
 const alive=useRef(true),working=useRef(false),epoch=useRef(0),refreshRef=useRef<()=>Promise<void>>(async()=>{});
 const current=recipes.find(recipe=>recipe.id===selected);
 useEffect(()=>{
  alive.current=true;
  const refresh=async()=>{
   if(working.current)return;const ticket=++epoch.current;
   try{const data=await api('/api/images/recipes');if(alive.current&&ticket===epoch.current){setRecipes(data.recipes);setLoaded(true);setError('')}}
   catch{if(alive.current&&ticket===epoch.current)setError('Не удалось загрузить пресеты.')}
  };
  refreshRef.current=refresh;const stop=pollVisible(refresh,15000),focus=()=>void refresh();window.addEventListener('focus',focus);
  return()=>{alive.current=false;++epoch.current;stop();window.removeEventListener('focus',focus)};
 },[userId]);
 const begin=()=>{working.current=true;++epoch.current;setBusy(true)};
 const finish=()=>{working.current=false;if(alive.current){setBusy(false);void refreshRef.current()}};
 const openEditor=(mode:Editor['mode'])=>{
  if(!ready||working.current||(mode!=='create'&&!current))return;
  const snapshot=structuredClone(draft);
  setEditor({mode,id:mode==='create'?crypto.randomUUID():current!.id,recipe:mode==='create'?undefined:structuredClone(current),draft:snapshot});
  setName(mode==='create'?'':current!.name);setFixed(mode==='update'&&current!.values.seed!=='-1');
  setSeed(Number(snapshot.seed)>=0?snapshot.seed:current?.values.seed&&current.values.seed!=='-1'?current.values.seed:'');setEditError('');
 };
 const choose=async(id:string)=>{
  if(!id){setSelected('');return}if(!ready||working.current)return;
  const recipe=recipes.find(item=>item.id===id);if(!recipe)return;
  begin();setApplyError('');
  try{await onApply(recipe.values);if(alive.current){setSelected(id);notify(`Применён пресет «${recipe.name}»`)}}
  catch(e){if(alive.current){const message=e instanceof Error?e.message:'Не удалось применить пресет.';setApplyError(message);if(compact)notify(message)}}
  finally{finish()}
 };
 const savesValues=editor?.mode==='create'||editor?.mode==='update';
 const values=editor?recipeValues(editor.draft,fixed?seed:'-1'):null;
 const invalid=values&&savesValues?validateRecipe(values):'';
 const invalidSeed=fixed&&(!/^\d+$/.test(seed)||!Number.isSafeInteger(Number(seed))||Number(seed)<0);
 const submit=async()=>{
  if(!editor||working.current)return;
  if(editor.mode!=='delete'&&!name.trim()){setEditError('Введите название пресета.');return}
  if(savesValues&&(invalid||invalidSeed)){setEditError(invalid||'Введите целый seed от 0 до 9007199254740991.');return}
  begin();setEditError('');
  try{
   if(editor.mode==='delete'){
    await api(`/api/images/recipes/${editor.id}?version=${editor.recipe!.version}`,'DELETE');
    if(alive.current){setRecipes(items=>items.filter(item=>item.id!==editor.id));setSelected(value=>value===editor.id?'':value);notify('Пресет удалён')}
   }else{
    const result=await api(editor.mode==='create'?'/api/images/recipes':`/api/images/recipes/${editor.id}`,editor.mode==='create'?'POST':'PATCH',editor.mode==='create'?{id:editor.id,name:name.trim(),values}:{version:editor.recipe!.version,name:name.trim(),...(editor.mode==='update'?{values}:{} )});
    if(alive.current){setRecipes(items=>[result.recipe,...items.filter(item=>item.id!==result.recipe.id)]);setSelected(result.recipe.id);notify(editor.mode==='create'?'Пресет сохранён':editor.mode==='rename'?'Пресет переименован':'Пресет обновлён')}
   }
   if(alive.current)setEditor(null);
  }catch(e){if(alive.current)setEditError(e instanceof Error?e.message:'Не удалось сохранить пресет.')}
  finally{finish()}
 };
 const title=editor?{create:'Сохранить пресет',update:'Обновить пресет',rename:'Переименовать пресет',delete:'Удалить пресет'}[editor.mode]:'';
 const changed=current&&JSON.stringify(recipeValues(draft,current.values.seed==='-1'?'-1':draft.seed))!==JSON.stringify(recipeValues(current.values,current.values.seed));
 const modal=<>
  <Modal open={!!editor} onClose={()=>{if(!working.current)setEditor(null)}} title={title} persistent={busy} className="studio-recipe-modal">
   {editor&&<form onSubmit={event=>{event.preventDefault();event.stopPropagation();void submit()}}>
    {editor.mode==='delete'?<p className="studio-recipe-description">Удалить «{editor.recipe!.name}» из сохранённых пресетов? Текущие настройки и арты сохранятся.</p>:<label className="studio-recipe-name">Название<input aria-label="Название пресета" value={name} onChange={event=>setName(event.target.value)} maxLength={100} autoComplete="off" placeholder="Например, мягкий аниме-портрет" disabled={busy}/></label>}
    {savesValues&&values&&<>
     <div className="studio-recipe-summary"><strong>{imageModelName(values.model)}</strong><span>{values.width} × {values.height} · {values.steps} шаг. · CFG {values.cfg}{values.loras.length?` · LoRA: ${values.loras.length}`:''}</span><p>{editor.mode==='update'?'Пресет получит текущие промпты и параметры студии.':'Сохранятся промпты, модель, LoRA и все параметры генерации.'}</p></div>
     <label className="studio-recipe-seed-option"><input type="checkbox" checked={fixed} onChange={event=>setFixed(event.target.checked)} disabled={busy}/>Сохранить фиксированный seed</label>
     {fixed?<label className="studio-recipe-seed-field">Seed<input aria-label="Seed пресета" type="text" inputMode="numeric" value={seed} onChange={event=>setSeed(event.target.value)} maxLength={16} disabled={busy} placeholder="0–9007199254740991"/></label>:<p className="studio-recipe-note">Seed будет случайным для каждой генерации.</p>}
    </>}
    {(editError||invalid)&&<p role="alert" className="studio-recipe-error">{editError||invalid}</p>}
    <div className="studio-recipe-dialog-actions"><Button type="button" variant="ghost" disabled={busy} onClick={()=>setEditor(null)}>Отмена</Button><Button type="submit" variant={editor.mode==='delete'?'destructive':'default'} disabled={busy||(editor.mode!=='delete'&&!name.trim())||!!invalid||(!!savesValues&&invalidSeed)}><StateTransition className="is-icon" stateKey={busy?'busy':'ready'}>{busy?<Loader2 size={16} className="spin"/>:editor.mode==='delete'?<Trash2 size={16}/>:<BookmarkPlus size={16}/>}</StateTransition>{editor.mode==='delete'?'Удалить':editor.mode==='update'?'Обновить':'Сохранить'}</Button></div>
   </form>}
  </Modal>
 </>;
 if(compact)return <div className="studio-recipes is-compact">
  <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={`studio-recipe-chip ${current?"is-selected":""}`} disabled={!ready||busy} aria-label={current?`Пресет «${current.name}»${changed?', изменён':''}`:'Пресеты'}>{busy?<Loader2 size={14} className="spin"/>:<Bookmark size={14}/>}<span>{current?current.name:'Пресет'}</span>{changed&&<i className="studio-recipe-chip-changed" aria-hidden="true"/>}<ChevronDown size={12}/></button></DropdownMenuTrigger>
   <DropdownMenuContent className="floating-panel studio-recipe-menu is-compact" align="start" sideOffset={6} collisionPadding={12}>
    {loop&&<DropdownMenuLabel className="studio-recipe-menu-note">При применении пресета непрерывный цикл выключится.</DropdownMenuLabel>}
    {error?<><DropdownMenuLabel className="studio-recipe-menu-note" role="alert">{error}</DropdownMenuLabel><DropdownMenuItem onSelect={()=>void refreshRef.current()}><RefreshCw size={14}/>Обновить список</DropdownMenuItem></>
     :!loaded?<DropdownMenuLabel className="studio-recipe-menu-note">Загружаю пресеты…</DropdownMenuLabel>
     :recipes.length?recipes.map(recipe=><DropdownMenuItem key={recipe.id} className="studio-recipe-menu-preset" onSelect={()=>void choose(recipe.id)}>{recipe.id===current?.id?<Check size={14}/>:<span className="studio-recipe-menu-gap" aria-hidden="true"/>}<span>{recipe.name}</span></DropdownMenuItem>)
     :<DropdownMenuLabel className="studio-recipe-menu-note">Сохранённых пресетов пока нет.</DropdownMenuLabel>}
    <DropdownMenuSeparator/>
    <DropdownMenuItem onSelect={()=>openEditor('create')}><BookmarkPlus size={14}/>Сохранить как пресет</DropdownMenuItem>
    {current&&<>
     <DropdownMenuItem onSelect={()=>openEditor('update')}><RefreshCw size={14}/>Обновить «{current.name}»</DropdownMenuItem>
     <DropdownMenuItem onSelect={()=>openEditor('rename')}><Pencil size={14}/>Переименовать</DropdownMenuItem>
     <DropdownMenuItem onSelect={()=>setSelected('')}><X size={14}/>Не использовать пресет</DropdownMenuItem>
     <DropdownMenuItem className="destructive" onSelect={()=>openEditor('delete')}><Trash2 size={14}/>Удалить пресет</DropdownMenuItem>
    </>}
   </DropdownMenuContent>
  </DropdownMenu>
  {modal}
 </div>;
 return <div className="studio-recipes">
  <div className="studio-recipes-row">
   <Select aria-label="Пресет генерации" value={current?.id||''} disabled={!ready||busy||!loaded||!recipes.length} displayValue={<span>{current?current.name:'Пресеты'}{changed&&<small> · изменён</small>}</span>} onChange={event=>void choose(event.target.value)}>
    <SelectOption value="">Текущие настройки</SelectOption>{recipes.map(recipe=><SelectOption key={recipe.id} value={recipe.id}>{recipe.name}</SelectOption>)}
   </Select>
   <IconButton label="Применить выбранный пресет" disabled={!current||!ready||busy} onClick={()=>void choose(current!.id)}><RefreshCw size={16}/></IconButton>
   <IconButton label="Сохранить пресет" disabled={!ready||busy} onClick={()=>openEditor('create')}><BookmarkPlus size={16}/></IconButton>
   <DropdownMenu><DropdownMenuTrigger asChild><IconButton label="Действия с пресетом" showHint={false} disabled={!current||!ready||busy}><MoreHorizontal size={18}/></IconButton></DropdownMenuTrigger>
    <DropdownMenuContent className="floating-panel studio-recipe-menu" align="end" sideOffset={6}>
     <DropdownMenuItem onSelect={()=>openEditor('update')}><RefreshCw size={14}/>Обновить текущими настройками</DropdownMenuItem>
     <DropdownMenuItem onSelect={()=>openEditor('rename')}><Pencil size={14}/>Переименовать</DropdownMenuItem>
     <DropdownMenuItem className="destructive" onSelect={()=>openEditor('delete')}><Trash2 size={14}/>Удалить пресет</DropdownMenuItem>
    </DropdownMenuContent>
   </DropdownMenu>
  </div>
  {busy&&!editor&&<p className="studio-recipe-status" role="status"><Loader2 size={14} className="spin"/>Применяю пресет…</p>}
  {loop&&<p className="studio-recipe-note">При применении пресета непрерывный цикл выключится.</p>}
  {(error||applyError)&&<div className="studio-recipe-error" role="alert"><span>{error||applyError}</span><button type="button" onClick={()=>void refreshRef.current()}>Обновить список</button></div>}
  {modal}
 </div>;
}
