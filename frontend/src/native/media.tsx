import {useEffect,useState,type ImgHTMLAttributes} from 'react';
import {isNativeIOS} from './platform';

// Direct <img>/<video> requests cannot carry the bearer header across origins.
// Other chat media already uses authenticated blob caches; keep this adapter
// confined to legacy local-video URLs. Nothing changes in Safari/desktop.
export function useNativeMedia(path:string,enabled=true){
 const native=isNativeIOS()&&path.startsWith('/api/');
 const [result,setResult]=useState<{path:string;url:string}>();
 useEffect(()=>{
  if(!native||!enabled)return;
  const controller=new AbortController();let url='';
  void fetch(path,{signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error();const blob=await response.blob();if(controller.signal.aborted)return;
   url=URL.createObjectURL(blob);setResult({path,url});
  }).catch(()=>{});
  return()=>{controller.abort();if(url)URL.revokeObjectURL(url)};
 },[path,native,enabled]);
 return native?result?.path===path?result.url:undefined:path;
}
export function NativeImage({src='',...props}:ImgHTMLAttributes<HTMLImageElement>){
 const url=useNativeMedia(src);return <img {...props} src={url}/>;
}
