import {useEffect,useState,type ReactNode} from 'react';
import {isNativeIOS} from './platform';
import {nativeServer} from './network';
import {hideNativeSplash} from './runtime';
import {NativeConnection} from './NativeConnection';
export function NativeApplication({children}:{children:ReactNode}){
 const [connection,setConnection]=useState(isNativeIOS()&&!nativeServer());
 useEffect(()=>{
  hideNativeSplash();const open=()=>setConnection(true);
  const storageError=()=>{void import('../store').then(({notify})=>notify('Не удалось сохранить настройки на iPhone. Не закрывайте приложение и повторите действие.'))};
  const shareError=()=>{void import('../store').then(({notify})=>notify('Не удалось сохранить файл. Проверьте подключение и повторите скачивание.'))};
  const notification=(event:Event)=>{const id=(event as CustomEvent).detail?.chatId;if(typeof id==='string')void import('../store').then(({selectChat})=>selectChat(id))};
  window.addEventListener('native-server-settings',open);window.addEventListener('native-storage-error',storageError);window.addEventListener('native-share-error',shareError);window.addEventListener('native-notification-open',notification);
  return()=>{window.removeEventListener('native-server-settings',open);window.removeEventListener('native-storage-error',storageError);window.removeEventListener('native-share-error',shareError);window.removeEventListener('native-notification-open',notification)};
 },[]);
 return connection?<NativeConnection onClose={nativeServer()?()=>setConnection(false):undefined}/>:children;
}
