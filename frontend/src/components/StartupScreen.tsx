import {accountKey} from '../accountStorage';
import {motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {Wordmark} from './SidebarBrand';

export function StartupScreen(){
 const reduced=useReducedMotion(),logo=localStorage.getItem(accountKey('saxarachat_custom_logo'))||'/css/icons/llm-chat.svg';
 return <motion.div className="startup-screen" role="status" aria-label="Загрузка LLM Chat" initial={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:.32,ease:'easeOut'}}>
  <motion.div className="startup-identity" initial={{opacity:0,y:reduced?0:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:-6}} transition={{duration:reduced?0:.4,ease:[.23, 1, .32, 1]}}>
   <div className="startup-mark" data-icon-motion-host><svg data-icon-motion="startup-orbit" className="startup-orbit" viewBox="0 0 88 88" aria-hidden="true"><circle className="startup-orbit-track" cx="44" cy="44" r="40"/><circle className="startup-orbit-arc" cx="44" cy="44" r="40"/></svg><img data-icon-motion="brand" src={logo} alt=""/></div>
   <div className="startup-name"><Wordmark/></div><span className="startup-caption">Ваше пространство для разговоров</span>
  </motion.div>
 </motion.div>;
}
