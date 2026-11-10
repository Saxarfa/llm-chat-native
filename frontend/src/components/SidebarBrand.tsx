import {accountKey} from '../accountStorage';

/** Вордмарк «llm/chat»: «llm» курсивом, приглушённая косая, «chat» прямым. Вид — `.wordmark` в typography.css. */
export function Wordmark(){
 return <span className="wordmark" role="img" aria-label="LLM Chat"><i>llm</i><span className="wordmark-slash">/</span>chat</span>;
}

export function SidebarBrand(){
 const customLogo=localStorage.getItem(accountKey('saxarachat_custom_logo'));
 return <>{customLogo&&<img data-icon-motion="brand" className="brand-icon" src={customLogo} alt=""/>}<span className="brand-wordmark"><Wordmark/></span></>;
}
