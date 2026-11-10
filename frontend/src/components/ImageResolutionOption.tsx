import {SlidersHorizontal} from '../icons';
import {SelectOption} from './Select';

type Props={value:string;label:string;width?:number;height?:number;custom?:boolean};

export function ImageResolutionOption({value,label,width,height,custom=false}:Props){
 const ratio=width&&height?width/height:1;
 const frameWidth=ratio>=1?20:Math.max(8,Math.round(20*ratio));
 const frameHeight=ratio>=1?Math.max(8,Math.round(20/ratio)):20;
 return <SelectOption value={value} className={`image-resolution-select-option${custom?' image-resolution-option-custom':''}`}>
  <span className="image-resolution-option-content">
   <span className="image-resolution-preview" aria-hidden="true">
    {custom?<SlidersHorizontal size={14}/>:<i data-icon-motion="frame" style={{width:frameWidth,height:frameHeight}}/>}
   </span>
   <span className="image-resolution-name">{label}</span>
   {(width&&height)&&<small className="image-resolution-dimensions">{width} × {height}</small>}
   {custom&&<small className="image-resolution-dimensions">Настроить</small>}
  </span>
 </SelectOption>;
}

const knownResolutions:Record<string,string>={
 '512x512':'Квадрат','1024x1024':'Квадрат','832x1216':'Портрет',
 '1216x832':'Альбом','1248x1824':'Большой портрет',
};

export function imageResolutionDisplay(value:string){
 if(value==='custom')return 'Своё разрешение';
 const [width,height]=value.split('x');
 const label=knownResolutions[value];
 return label?`${label} · ${width} × ${height}`:value.replace('x',' × ');
}
