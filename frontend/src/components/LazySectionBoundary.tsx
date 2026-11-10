import {Component,type ReactNode} from 'react';
import {RefreshCw,TriangleAlert} from '../icons';
import {Button} from './primitives';
import './LazySectionBoundary.css';

type Props={children:ReactNode;title:string;onBack:()=>void;onError?:(error:Error)=>void;resetKey?:string|number};
/** A failed optional section must not unmount the user's entire chat application. */
export class LazySectionBoundary extends Component<Props,{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error:Error){this.props.onError?.(error)}
 componentDidUpdate(previous:Props,previousState:{failed:boolean}){if(previous.resetKey!==this.props.resetKey&&previousState.failed&&this.state.failed)this.setState({failed:false})}
 render(){
  if(!this.state.failed)return this.props.children;
  return <div className="lazy-section-error" role="alert">
   <TriangleAlert size={24}/>
   <h2>Не удалось открыть {this.props.title}</h2>
   <p>Проверь соединение и обнови страницу, чтобы загрузить интерфейс заново.</p>
   <div><Button type="button" onClick={()=>location.reload()}><RefreshCw size={14}/>Обновить страницу</Button><Button type="button" variant="outline" onClick={this.props.onBack}>Вернуться в чат</Button></div>
  </div>;
 }
}
