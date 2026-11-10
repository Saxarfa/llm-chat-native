import {useEffect,useState} from 'react';
import {Button,copyText} from './primitives';

export function SettingsError({message='Не удалось выполнить действие. Проверьте подключение и повторите попытку.',detail,retry}:{message?:string;detail?:string;retry?:()=>void}){
 const [copied,setCopied]=useState(false);
 const copy=()=>{void copyText(JSON.stringify({code:'settings_request_failed',section:location.hash.split('/')[1]||'settings',time:new Date().toISOString()})).then(()=>setCopied(true)).catch(()=>setCopied(false))};
 return <div className="settings-error" role="alert"><p>{message}{detail&&detail!==message&&<small className="settings-error-detail">{detail.slice(0,160)}</small>}</p><div>{retry&&<Button variant="outline" onClick={retry}>{detail?'Скрыть':'Повторить попытку'}</Button>}<Button variant="ghost" className="settings-error-copy" onClick={copy}>{copied?'Скопировано':'Скопировать детали'}</Button></div></div>;
}

export function SettingsLoading({label='Загружаем настройки…'}:{label?:string}){
 const [phase,setPhase]=useState(0);
 useEffect(()=>{const a=setTimeout(()=>setPhase(1),100),b=setTimeout(()=>setPhase(2),1000);return()=>{clearTimeout(a);clearTimeout(b)}},[]);
 return <div className="settings-loading" role="status" aria-live="polite">{phase>0&&<span>{label}</span>}{phase===2&&<div aria-hidden="true" className="settings-skeleton"><i/><i/><i/></div>}</div>;
}
