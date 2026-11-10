import {isNativeIOS} from './native/platform';

async function start(){
 if(isNativeIOS()){
  document.documentElement.dataset.capacitor='ios';
  const {initializeNativeNetwork,nativeServer,clearWebCacheForServerChange}=await import('./native/network');
  await initializeNativeNetwork();
  await clearWebCacheForServerChange();
  const {mirrorNativeStorage}=await import('./native/storage');
  await mirrorNativeStorage(nativeServer());
  const {initializeNativeRuntime}=await import('./native/runtime');
  await initializeNativeRuntime();
 }
 // Hydrate before the legacy storage manager and React modules read state.
 await new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script');script.src='/js/storage.js?v=7-temporary-chats';script.onload=()=>resolve();script.onerror=reject;document.head.append(script);
 });
 await import('./main');
}
void start().catch(async()=>{
 document.getElementById('root')!.textContent='Не удалось открыть LLM Chat. Закройте и снова откройте приложение.';
 if(isNativeIOS()){const {SplashScreen}=await import('@capacitor/splash-screen');await SplashScreen.hide()}
});
