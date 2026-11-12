import {defaultImageLoras,type ImageLora} from './imageLoras';
import {configFor} from './domain';
import {imageModelAlignment} from './components/imageModels';
import type {Values} from './types';
import {knowledgeSelection,type KnowledgeSelection} from './knowledge';
import {imageGenerationPreference,imageAspectRatios,imageOutputSizes} from './imageGeneration';

export type WorkspaceImageSettings = {
 source?:'local'|'aistudio';aspect_ratio?:string;image_size?:string;allow_auto_4k?:boolean;
 loras:ImageLora[];model:string; sampler:string; negative:string; width:number; height:number; steps:number; cfg:number; seed:number;
};
export type WorkspacePreset = {
 id:string; name:string; description:string; greeting?:string; cover:string; model_id:string;
 config:Values; image_settings:WorkspaceImageSettings; version:number;knowledge?:KnowledgeSelection;
 created_at?:number; updated_at?:number;
};
export const workspaceImageDefaults:WorkspaceImageSettings={source:'local',aspect_ratio:'auto',image_size:'1K',model:'anima_baseV10.safetensors',sampler:'er_sde',negative:'',width:1024,height:1024,steps:30,cfg:4,seed:-1,loras:defaultImageLoras('anima')};
const configKeys=['temperature','top_p','min_p','top_k','repeat_penalty','presence_penalty','frequency_penalty','max_tokens','systemPrompt','stop','thinking','reasoning_effort','reasoning_strength','searchMode','contextSize'];
function supportedConfig(values:Values):Values{
 return Object.fromEntries(configKeys.filter(key=>values[key]!==undefined).map(key=>[key,values[key]]));
}
export function presetConfig(model:string,settings:Values):Values{
 const values={...configFor(model,settings),thinking:true,reasoning_effort:'xhigh',reasoning_strength:'high',searchMode:settings.searchMode||'disabled',...settings.modelConfigs?.[model]};
 if(model.startsWith('aistudio/'))values.reasoning_strength=configFor(model,settings).reasoning_strength;
 return supportedConfig(values);
}
export function presetImageSettings(values:Values={}):WorkspaceImageSettings{
 const [width,height]=typeof values.size==='string'&&/^\d+x\d+$/.test(values.size)?values.size.split('x').map(Number):[Number(values.width),Number(values.height)];
 return {source:values.source==='aistudio'?'aistudio':'local',aspect_ratio:values.aspect_ratio||'auto',image_size:values.image_size||'1K',allow_auto_4k:values.allow_auto_4k===true,loras:Array.isArray(values.loras)?values.loras.map((item:ImageLora)=>({...item})):defaultImageLoras(values.model||workspaceImageDefaults.model),model:values.model||workspaceImageDefaults.model,sampler:values.sampler||workspaceImageDefaults.sampler,negative:values.negative||'',width:Number.isFinite(width)&&width>0?width:1024,height:Number.isFinite(height)&&height>0?height:1024,steps:Number(values.steps??30),cfg:Number(values.cfg??4),seed:Number(values.seed??-1)};
}
export function presetImagesForModel(model:string,settings:Values,local:Values=workspaceImageDefaults):WorkspaceImageSettings{
 const preference=imageGenerationPreference(settings.modelConfigs?.[model]?.imageGeneration),values=presetImageSettings(local);
 return {...values,source:preference.source==='aistudio'?'aistudio':'local',...(preference.source==='local'?{model:preference.local_model||values.model}:{}),aspect_ratio:preference.aspect_ratio,image_size:preference.image_size,allow_auto_4k:preference.allow_auto_4k};
}
export function clonePreset(preset:WorkspacePreset):WorkspacePreset{
 return {...preset,id:'',name:`${preset.name.slice(0,91)} · копия`,version:0,config:structuredClone(preset.config),image_settings:{...preset.image_settings}};
}
export function presetConflict(edited:WorkspacePreset,presets:WorkspacePreset[]){
 if(!edited.id)return false;
 const saved=presets.find(preset=>preset.id===edited.id);
 return !saved||saved.version!==edited.version;
}
export function normalizePreset(preset:WorkspacePreset):WorkspacePreset{
 return {...preset,config:supportedConfig(preset.config),greeting:preset.greeting||'',image_settings:presetImageSettings(preset.image_settings),knowledge:knowledgeSelection(preset.knowledge)};
}
export function presetPayload(preset:WorkspacePreset,sourceTab:string,copy=false){
 return {name:preset.name.trim(),description:preset.description,greeting:(preset.greeting||'').trim(),cover:preset.cover,model_id:preset.model_id.trim(),
  config:{...supportedConfig(preset.config),stop:(preset.config.stop||[]).filter((stop:string)=>stop.length)},image_settings:{...preset.image_settings},knowledge:knowledgeSelection(preset.knowledge),
  source_tab:sourceTab,...(preset.id&&!copy?{version:preset.version}:{})};
}
export function validatePreset(preset:WorkspacePreset):{tab:'identity'|'model'|'images';message:string}|undefined{
 if(!preset.name.trim()||preset.name.trim().length>100||/[\x00-\x1f]/.test(preset.name))return {tab:'identity',message:'Введите название пресета от 1 до 100 символов.'};
 if(!preset.model_id.trim()||preset.model_id.length>512)return {tab:'identity',message:'Выберите модель для этого пресета.'};
 if(preset.description.length>2000)return {tab:'identity',message:'Описание должно быть не длиннее 2 000 символов.'};
 if((preset.greeting||'').length>160)return {tab:'identity',message:'Приветствие должно быть не длиннее 160 символов.'};
 const ranges:[string,string,number,number,boolean?][]=[['temperature','Температура',0,2],['top_p','Top-P',0,1],['min_p','Min-P',0,1],['top_k','Top-K',0,1000,true],['repeat_penalty','Штраф за повторы',0,3],['presence_penalty','Presence penalty',-2,2],['frequency_penalty','Frequency penalty',-2,2]];
 for(const [key,label,min,max,integer] of ranges){const value=preset.config[key];if(!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))return {tab:'model',message:`${label}: укажите ${integer?'целое ':''}число от ${min} до ${max}.`}}
 const limit=preset.config.max_tokens;if(limit!==-1&&(!Number.isInteger(limit)||limit<1||limit>1048576))return {tab:'model',message:'Длина ответа должна быть от 1 до 1 048 576 токенов или «Максимум».'};
 if((preset.config.systemPrompt||'').length>64000)return {tab:'model',message:'Системный промпт должен быть не длиннее 64 000 символов.'};
 const stop=(preset.config.stop||[]).filter(Boolean);if(stop.length>32||stop.some((value:string)=>value.length>1024))return {tab:'model',message:'Допустимо до 32 стоп-последовательностей, не длиннее 1 024 символов каждая.'};
 const image=preset.image_settings;
 if(image.source==='aistudio')return !imageAspectRatios.includes(image.aspect_ratio||'auto')||!['auto',...imageOutputSizes].includes(image.image_size||'1K')?{tab:'images',message:'Проверьте формат и разрешение Nano Banana.'}:undefined;
 if(![image.width,image.height].every(n=>Number.isInteger(n)&&n>=256&&n<=4096&&n%imageModelAlignment(image.model)===0))return {tab:'images',message:`Ширина и высота — от 256 до 4 096 пикселей, кратные ${imageModelAlignment(image.model)}.`};
 if(!Number.isInteger(image.steps)||image.steps<1||image.steps>80)return {tab:'images',message:'Количество шагов — целое число от 1 до 80.'};
 if(!Number.isFinite(image.cfg)||image.cfg<0||image.cfg>20)return {tab:'images',message:'CFG должен быть от 0 до 20.'};
 if(!Number.isSafeInteger(image.seed)||image.seed< -1)return {tab:'images',message:'Seed — целое число от −1 до 9 007 199 254 740 991.'};
 if(image.negative.length>16000)return {tab:'images',message:'Негативный промпт должен быть не длиннее 16 000 символов.'};
 if(!image.sampler||image.sampler.length>128||image.model.length>512)return {tab:'images',message:'Проверьте выбранный чекпоинт и семплер.'};
}
