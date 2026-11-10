import {SettingsError,SettingsLoading} from './SettingsFeedback';
import {LoraControls} from './LoraControls';
import {NumberInput} from './NumberInput';
import {Select,SelectOption} from './Select';
import {ImageResolutionOption,imageResolutionDisplay} from './ImageResolutionOption';
import {ImageModelOptions,imageModelName,imageModelAlignment} from './imageModels';
import {Reveal} from './Reveal';
import {useEffect,useId,useState} from 'react';
import {Loader2} from '../icons';
import {Disclosure} from './primitives';
import {useImageDraft} from './useImageDraft';
import {api} from '../store';

type Config={online:boolean;models:string[];samplers:string[]};
function NumberField({label,value,min,max,step=1,onChange}:{label:string;value:number|string;min:number;max:number;step?:number;onChange:(value:number)=>void}){
 const [draft,setDraft]=useState(String(value)),[error,setError]=useState(''),errorId=useId();
 useEffect(()=>{setDraft(String(value));setError('')},[value]);
 const commit=()=>{
  const n=Number(draft),valid=draft.trim()!==''&&Number.isFinite(n)&&n>=min&&n<=max&&(step<1||Number.isInteger(n))&&(step<8||n%step===0);
  if(!valid){setError(step>=8?`От 256 до 4096, кратно ${step}`:`От ${min} до ${max}`);return}
  setError('');onChange(n);
 };
 return <label className="settings-field"><span>{label}</span><NumberInput aria-label={label} aria-invalid={!!error} aria-describedby={errorId} type="number" min={min} max={max} step={step} value={draft} onChange={e=>{setDraft(e.target.value);setError('')}} onFocus={()=>setError('')} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/><small id={errorId} className="field-error" role={error?'alert':undefined}>{error||'\u00a0'}</small></label>;
}
export function ImageGenerationSettings({userId}:{userId:string}){
 const {values,edit,ready,syncError,switchModel}=useImageDraft(userId),[config,setConfig]=useState<Config|null>(null);
 useEffect(()=>{let alive=true;void api('/api/images/config').then(data=>{if(alive)setConfig(data)}).catch(()=>{});return()=>{alive=false}},[]);
 const models=[...new Set([values.model,...(config?.models||[])])].filter(Boolean),samplers=[...new Set([values.sampler,...(config?.samplers||[])])].filter(Boolean);
 return <section className="settings-section image-generation-settings"><h3>Изображения</h3><p>Общие настройки генерации. Для актёров используются их собственные параметры.</p>
 <fieldset disabled={!ready} className="image-settings-fields">
 <label className="settings-field"><span>Чекпоинт</span><Select value={values.model} displayValue={imageModelName(values.model)} onChange={e=>void switchModel(e.target.value)}><ImageModelOptions models={models}/></Select></label>
 <div className="image-settings-grid"><label className="settings-field"><span>Разрешение</span><Select value={values.size} displayValue={imageResolutionDisplay(values.size)} onChange={e=>edit({size:e.target.value})}><ImageResolutionOption value="512x512" label="Квадрат" width={512} height={512}/><ImageResolutionOption value="1024x1024" label="Квадрат" width={1024} height={1024}/><ImageResolutionOption value="832x1216" label="Портрет" width={832} height={1216}/><ImageResolutionOption value="1216x832" label="Альбом" width={1216} height={832}/><ImageResolutionOption value="1248x1824" label="Большой портрет" width={1248} height={1824}/><ImageResolutionOption value="custom" label="Своё разрешение" custom/>{!['512x512','1024x1024','832x1216','1216x832','1248x1824','custom'].includes(values.size)&&<ImageResolutionOption value={values.size} label="Другой формат" width={Number(values.size.split('x')[0])} height={Number(values.size.split('x')[1])}/>}</Select></label><label className="settings-field"><span>Семплер</span><Select value={values.sampler} onChange={e=>edit({sampler:e.target.value})}>{samplers.map(name=><SelectOption key={name} value={name}>{name}</SelectOption>)}</Select></label></div>
 <Reveal show={values.size==='custom'}><div className="image-settings-pair"><NumberField label="Ширина" value={values.width} min={256} max={4096} step={imageModelAlignment(values.model)} onChange={n=>edit({width:String(n)})}/><NumberField label="Высота" value={values.height} min={256} max={4096} step={imageModelAlignment(values.model)} onChange={n=>edit({height:String(n)})}/></div><small className="muted">Размеры от 256 до 4096 px, кратные {imageModelAlignment(values.model)}.</small></Reveal>
 <div className="image-settings-pair"><NumberField label="Шаги" value={values.steps} min={1} max={80} onChange={n=>edit({steps:n})}/><NumberField label="CFG" value={values.cfg} min={0} max={20} step={.1} onChange={n=>edit({cfg:n})}/></div>
 
 <LoraControls model={values.model} value={values.loras} onChange={loras=>edit({loras})}/><Disclosure title="Дополнительные настройки"><label className="settings-field"><span>Негативный промпт</span><textarea maxLength={16000} value={values.negative} onChange={e=>edit({negative:e.target.value})}/></label><NumberField label="Seed" value={values.seed} min={-1} max={9007199254740991} onChange={n=>edit({seed:String(n)})}/><small className="muted">−1 — случайный seed для каждого арта.</small></Disclosure>
 </fieldset>{syncError?<SettingsError/>:!ready&&<SettingsLoading/>}
 </section>;
}
