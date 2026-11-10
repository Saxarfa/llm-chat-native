import {useState,useSyncExternalStore} from 'react';
import {Bell,BellOff,Check,Download,RefreshCw,Share} from '../icons';
import {arePWANotificationsEnabled,canInstallPWA,getPWANotificationPermission,hasPWAUpdate,installPWA,isStandalone,setPWANotificationsEnabled,subscribePWA,supportsPWANotifications,updatePWA} from '../pwa';
import {triggerHaptic} from '../haptics';
import {Disclosure,Button} from './primitives';
import {isNativeIOS} from '../native/platform';
import {nativeServer,openServerSettings} from '../native/network';

export function PWASettings(){
 const installable=useSyncExternalStore(subscribePWA,canInstallPWA),update=useSyncExternalStore(subscribePWA,hasPWAUpdate),notificationsEnabled=useSyncExternalStore(subscribePWA,arePWANotificationsEnabled),[error,setError]=useState(false);
 const permission=useSyncExternalStore(subscribePWA,getPWANotificationPermission);
 return <div className="pwa-settings">
  <h4 className="settings-subheading">Приложение на телефоне</h4>
  {isNativeIOS()&&<><p>Сервер: {nativeServer()}</p><Button variant="outline" onClick={openServerSettings}>Изменить адрес сервера</Button></>}
  {isStandalone()?<p className="pwa-installed"><Check size={16}/>Открыто как приложение</p>:<>
   <p>LLM Chat можно добавить на главный экран и открывать в отдельном окне.</p>
   {installable?<Button variant="outline" onClick={()=>{setError(false);void installPWA().catch(()=>setError(true))}}><Download size={16}/>Установить LLM Chat</Button>:<Disclosure title="Как добавить на iPhone"><ol><li>Откройте адрес сайта в Safari.</li><li>Нажмите «Поделиться» <Share size={16} aria-hidden="true"/>, затем «На экран Домой».</li><li>Включите «Открывать как веб-приложение», если такой пункт есть, и нажмите «Добавить».</li></ol></Disclosure>}
   <small>Для чатов и генерации нужен доступ к серверу на ПК. Если подключаетесь через Tailscale, он должен быть включён и на телефоне.</small>
  </>}
  {supportsPWANotifications()&&<div className="pwa-notifications">
   {permission==='denied'?<p className="pwa-blocked" aria-describedby="pwa-notification-help"><BellOff size={16} aria-hidden="true"/>Уведомления заблокированы</p>
   :<Button variant="outline" type="button" aria-describedby="pwa-notification-help" aria-pressed={notificationsEnabled} onClick={()=>{triggerHaptic('light');void setPWANotificationsEnabled(!notificationsEnabled)}}>
    <Bell size={16}/>{notificationsEnabled?'Отключить уведомления':'Включить уведомления о завершении'}
   </Button>}
   <small id="pwa-notification-help">{permission==='denied'?'Разрешите уведомления для LLM Chat в настройках браузера или iOS, затем вернитесь в приложение.':isNativeIOS()?'Локальные уведомления работают, пока iOS позволяет приложению получать события. После приостановки приложения готовые ответы появятся при следующем открытии.':notificationsEnabled?'Сообщим, когда ответ, арт или видео будут готовы в фоновом режиме.':'Уведомление придёт, если ответ, арт или видео завершатся при свёрнутом приложении.'}</small>
  </div>}
  {error&&<p role="status">Не удалось открыть установку. Добавьте сайт через меню браузера.</p>}
  {update&&<Button variant="outline" onClick={updatePWA}><RefreshCw size={16}/>Применить обновление</Button>}
 </div>;
}
