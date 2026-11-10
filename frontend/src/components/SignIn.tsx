import {useRef,useState,type FormEvent} from 'react';
import {motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {ArrowRight,Check,Eye,EyeOff,Loader2,LockKeyhole,MessageCircle,UserRound} from '../icons';
import {signIn} from '../store';
import './SignIn.css';
import {StateTransition} from './StateTransition';
import {Reveal} from './Reveal';
import {SelectionHighlight} from './SelectionHighlight';
import {Wordmark} from './SidebarBrand';
import {isNativeIOS} from '../native/platform';
import {openServerSettings} from '../native/network';

export function SignIn(){
 const [register,setRegister]=useState(false),[name,setName]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const reduced=useReducedMotion(),tabs=useRef<HTMLDivElement>(null);
 const changeMode=(value:boolean)=>{setRegister(value);setError('');setConfirm('');setPassword('');setVisible(false)};
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(busy)return;setError('');
  if(register&&password!==confirm){setError('Пароли не совпадают');return}
  setBusy(true);try{await signIn(name.trim(),password,register)}catch(error){setError(error instanceof Error?error.message:'Не удалось войти. Попробуйте ещё раз.')}finally{setBusy(false)}
 };
 return <main className="auth-screen account-auth"><motion.div className="auth-layout" initial={{opacity:0,y:reduced?0:12}} animate={{opacity:1,y:0}} transition={{duration:reduced?0:.4,ease:[.23, 1, .32, 1]}}>
  <aside className="auth-story"><div className="auth-brand" data-icon-motion-host><img data-icon-motion="brand" src="/css/icons/llm-chat.svg" width={30} height={30} alt=""/><Wordmark/></div><div className="auth-story-body"><span className="auth-eyebrow">ВАШЕ ЛИЧНОЕ ПРОСТРАНСТВО</span><h1>Разговоры,<br/>к которым<br/><em>хочется вернуться.</em></h1><p>Собирайте идеи, находите ответы и продолжайте с того места, где остановились.</p><div className="auth-story-note"><MessageCircle size={16}/><span>Свои диалоги. Свои настройки. Свой ритм.</span></div></div><small>Локальные модели и облачные подключения в одном месте.</small></aside>
  <section className="auth-card" aria-label={register?'Регистрация':'Вход в аккаунт'}>
   <div ref={tabs} className="auth-tabs" aria-label="Вход или регистрация"><button type="button" aria-pressed={!register} disabled={busy} onClick={()=>changeMode(false)}>Вход</button><button type="button" aria-pressed={register} disabled={busy} onClick={()=>changeMode(true)}>Регистрация</button><SelectionHighlight container={tabs} activeKey={register?'register':'signin'} className="auth-tab-highlight"/></div>
   <header><div className="auth-card-icon"><UserRound size={20}/></div><h2>{register?'Начните с чистого листа':'С возвращением'}</h2><p>{register?'Создайте аккаунт — здесь всё будет вашим.':'Войдите, чтобы открыть свои диалоги.'}</p></header>
   <form onSubmit={submit} aria-busy={busy}>
    <label htmlFor="auth-username">Логин<input id="auth-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={name} onChange={e=>{setName(e.target.value);setError('')}} minLength={2} maxLength={register?40:80} pattern={register?'[\\p{L}\\p{N}_.\\-]+':undefined} placeholder="Ваш логин" required disabled={busy}/></label>
    <label htmlFor="auth-password">Пароль<div className="auth-password"><input id="auth-password" name="password" type={visible?'text':'password'} autoComplete={register?'new-password':'current-password'} value={password} onChange={e=>{setPassword(e.target.value);setError('')}} minLength={register?8:undefined} maxLength={128} placeholder={register?'Не менее 8 символов':'Введите пароль'} required disabled={busy}/><button type="button" aria-label={visible?'Скрыть пароль':'Показать пароль'} aria-pressed={visible} onClick={()=>setVisible(!visible)} disabled={busy}><StateTransition stateKey={visible?'visible':'hidden'} className="is-icon auth-eye-state">{visible?<EyeOff size={18}/>:<Eye size={18}/>}</StateTransition></button></div></label>
    <Reveal show={register}><label htmlFor="auth-confirm">Повторите пароль<input id="auth-confirm" name="confirm-password" type={visible?'text':'password'} autoComplete="new-password" value={confirm} onChange={e=>{setConfirm(e.target.value);setError('')}} minLength={8} maxLength={128} placeholder="Ещё раз, для проверки" required={register} disabled={busy}/></label></Reveal>
    <Reveal show={!!error}><div className="auth-error" role="alert">{error}</div></Reveal>
    <button className="auth-submit" type="submit" disabled={busy}>{busy?<><Loader2 size={18} className="spin"/>{register?'Создаю аккаунт…':'Вхожу…'}</>:<>{register?'Создать аккаунт':'Войти'}<ArrowRight size={18}/></>}</button>
    <Reveal show={register}><div className="auth-fresh-note"><Check size={14}/>Новые чаты, память и настройки — с нуля</div></Reveal>
   </form>
   <footer><LockKeyhole size={14}/><span>Данные вашего аккаунта доступны только после входа.</span></footer>
   {isNativeIOS()&&<button type="button" onClick={openServerSettings}>Изменить адрес сервера</button>}
  </section>
 </motion.div></main>
}
