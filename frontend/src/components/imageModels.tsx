import {SelectOption,SelectGroup} from './Select';
export const isNoctQ=(model:string)=>model.replace(/\\/g,'/').split('/').pop()?.toLowerCase()==='noctqa_v1_int8_convrot.safetensors';
export const isAnima29B=(model:string)=>model.replace(/\\/g,'/').split('/').pop()?.toLowerCase()==='anima-2.9b-preview-v1.safetensors';
export const isAnima38B=(model:string)=>model.replace(/\\/g,'/').split('/').pop()?.toLowerCase()==='anima-3.8b-v1.1.safetensors';
export const isMiaoMiao=(model:string)=>model.replace(/\\/g,'/').split('/').pop()?.toLowerCase()==='miaomiaorealskin_cknepsve10.safetensors';
export const sdxlModelNames:Record<string,string>={'waiillustrioussdxl_v170.safetensors':'WAI Illustrious · v17.0','prefectillustriousxl_v8.safetensors':'Prefect Illustrious XL · v8','cyberrealisticpony_v180coreshift.safetensors':'CyberRealistic Pony · v18.0 CoreShift'};
export const isSDXL=(model:string)=>isMiaoMiao(model)||!!sdxlModelNames[model.replace(/\\/g,'/').split('/').pop()?.toLowerCase()||''];
export const imageModelEngine=(model:string)=>isNoctQ(model)?'noct-q':isSDXL(model)?'sdxl':isAnima38B(model)?'anima-38b':isAnima29B(model)?'anima-29b':'anima';
export const nanoModelNames:Record<string,string>={'aistudio/gemini-nano-banana-2.1':'Nano Banana 2.1','aistudio/gemini-3.1-flash-lite-image':'Nano Banana 2 Lite','aistudio/gemini-3.1-flash-image':'Nano Banana 2','aistudio/gemini-3-pro-image':'Nano Banana Pro','aistudio/gemini-2.5-flash-image':'Nano Banana'};
export const imageModelName=(model:string)=>nanoModelNames[model]||sdxlModelNames[model.replace(/\\/g,'/').split('/').pop()?.toLowerCase()||'']||(model==='MiaoMiao_Harem_Anima_v1.6.safetensors'?'MiaoMiao Harem · Anima 1.6':isNoctQ(model)?'Noct Q Anime · INT8':isMiaoMiao(model)?'MiaoMiao RealSkin · EPS VE1.0':isAnima38B(model)?'Anima 3.8B · v1.1':isAnima29B(model)?'Anima 2.9B · Preview V1':model.replace(/\.safetensors$/i,''));
export const imageModelAlignment=(model:string)=>isNoctQ(model)?32:8;
export function ImageModelOptions({models}:{models:string[]}){
 return <>{[['Anima',models.filter(model=>!isNoctQ(model)&&!isSDXL(model))],['SDXL · Illustrious / Pony',models.filter(isSDXL)],['Noct Q · Qwen Image 2.1',models.filter(isNoctQ)]].map(([label,names])=>(names as string[]).length>0&&<SelectGroup key={label as string} label={label as string}>{(names as string[]).map(name=><SelectOption key={name} value={name}>{imageModelName(name)}</SelectOption>)}</SelectGroup>)}</>;
}
