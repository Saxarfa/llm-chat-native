import {modelTools,modelToolDescription,toolEnabled,allToolPermissions} from '../modelTools';
import type {Values} from '../types';
import './ModelToolSettings.css';

export function ModelToolSettings({value,onChange,disabled=false,model}:{model?:string;value:Values;onChange:(patch:Values)=>void;disabled?:boolean}){
 const enabled=value.toolCallingEnabled!==false;
 const tools=modelTools.filter(tool=>tool.name!=='show_web_image'||!model||model.startsWith('aistudio/'));
 const count=tools.filter(tool=>toolEnabled(value,tool.name)).length;
 return <section className="model-tool-settings">
  <p className="settings-intro">Выбери, какие действия модель может выполнять в чатах. Выбор сохраняется в её профиле.</p>
  <label className="switch-row model-tools-master"><span><strong>Использовать инструменты</strong><small>{enabled?`Доступно ${count} из ${tools.length}`:'Модель отвечает текстом без вызова инструментов'}</small></span><input type="checkbox" role="switch" aria-label="Использовать инструменты" checked={enabled} disabled={disabled} onChange={event=>onChange({toolCallingEnabled:event.target.checked})}/></label>
  <div className="model-tools-actions"><button type="button" disabled={disabled} onClick={()=>onChange({toolCallingEnabled:true,toolPermissions:allToolPermissions(true)})}>Включить всё</button><span aria-hidden="true">·</span><button type="button" disabled={disabled} onClick={()=>onChange({toolCallingEnabled:false})}>Отключить всё</button></div>
  <div className="model-tools-list" data-enabled={enabled}>{tools.map(tool=><label key={tool.name} className="switch-row"><span><strong>{tool.label}</strong><small>{modelToolDescription(tool,model)}</small></span><input type="checkbox" role="switch" aria-label={tool.label} disabled={disabled||!enabled} checked={value.toolPermissions?.[tool.name]!==false} onChange={event=>onChange({toolPermissions:{...value.toolPermissions,[tool.name]:event.target.checked}})}/></label>)}</div>
  <p className="model-tools-footnote">Общие настройки поиска, памяти и баз знаний тоже учитываются. Отключение инструментов не удаляет историю и сохранённые факты.</p>
 </section>;
}
