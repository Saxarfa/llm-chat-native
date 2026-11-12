import {imageModelEngine} from './components/imageModels';
export type ImageLora={name:string;strength:number;strength_clip?:number|null};
export type LoraEntry={name:string;architecture:string;label:string;compatibleArchitectures?:string[];title?:string;description?:string;triggers?:string};
export const loraCompatible=(entry:LoraEntry,architecture:string)=>(entry.compatibleArchitectures||[entry.architecture]).includes(architecture);
export const loraDisplayName=(name:string)=>name==='Amona_Jeane_Illustrious.safetensors'?'Амона Джин · Illustrious':name==='Alya_Kujou_Official_Art_Anima.safetensors'?'Аля Кудзё · официальный арт':name.replace(/\.safetensors$/i,'').replace(/_/g,' ');
export function defaultImageLoras(model:string):ImageLora[]{return model!=='MiaoMiao_Harem_Anima_v1.6.safetensors'&&imageModelEngine(model)==='anima'?[{name:'silvana-style-AB10-01.safetensors',strength:1}]:[]}
