import {BookOpen,Feather,ImagePlus} from '../icons';
import {CoffeeMark} from './CoffeeMark';
import {Avatar} from './primitives';
import {welcomeStarters} from '../chatWelcome';
import './ChatWelcome.css';

export function WelcomeHeading({title,actor,avatar}:{title:string;actor?:string;avatar?:string}){
 return <>{actor&&<div className="welcome-actor"><Avatar src={avatar} name={actor}/><span>{actor}</span></div>}<h1><span className="welcome-title" data-icon-motion-host><CoffeeMark/><span>{title}</span></span></h1></>;
}
const icons={explain:BookOpen,story:Feather,art:ImagePlus};
export function WelcomeActions({onChoose}:{onChoose?:(text:string)=>void}){
 return <>{welcomeStarters.map(starter=>{const Icon=icons[starter.id];return <button type="button" key={starter.id} aria-label={starter.label} onClick={()=>onChoose?.(starter.text)}><Icon size={16}/><span className="welcome-label">{starter.label}</span><span className="welcome-short" aria-hidden="true">{starter.short}</span></button>})}</>;
}
