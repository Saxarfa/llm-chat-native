import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {modelTools,toolEnabled,allToolPermissions} from './modelTools';
import {ModelToolSettings} from './components/ModelToolSettings';
import {presetImageSettings} from './workspacePresets';

describe('model tool preferences',()=>{
 it('preserves defaults and disables just the chosen tool',()=>{
  expect(modelTools.every(tool=>toolEnabled({},tool.name))).toBe(true);
  const config={toolPermissions:{generate_image:false}};
  expect(toolEnabled(config,'generate_image')).toBe(false);
  expect(toolEnabled(config,'web_search')).toBe(true);
 });
 it('master switch disables every tool without erasing individual choices',()=>{
  const config={toolCallingEnabled:false,toolPermissions:{generate_image:false,web_search:true}};
  expect(modelTools.every(tool=>!toolEnabled(config,tool.name))).toBe(true);
  expect(toolEnabled({...config,toolCallingEnabled:true},'generate_image')).toBe(false);
  expect(toolEnabled({...config,toolCallingEnabled:true},'web_search')).toBe(true);
  expect(Object.keys(allToolPermissions(true))).toHaveLength(modelTools.length);
 });
 it('renders a named master switch and all individual switches',()=>{
  const html=renderToStaticMarkup(<ModelToolSettings value={{toolCallingEnabled:false}} onChange={()=>{}}/>);
  expect(html.match(/role="switch"/g)).toHaveLength(modelTools.length+1);
  expect(html.match(/disabled=""/g)).toHaveLength(modelTools.length);
  for(const tool of modelTools)expect(html).toContain(`aria-label="${tool.label}"`);
  expect(html).toContain('Включить всё');expect(html).toContain('Отключить всё');
 });
 it('drops legacy brush settings from actor snapshots but preserves generation',()=>{
  const normalized=presetImageSettings({edit_strength:.8,edit_steps:40,edit_cfg:0,steps:32,cfg:5,prompt:'sky'});
  expect(Object.keys(normalized).some(key=>key.startsWith('edit_'))).toBe(false);
  expect(normalized.steps).toBe(32);expect(normalized.cfg).toBe(5);
 });
});
