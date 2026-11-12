import {describe,expect,it} from 'vitest';
import {clonePreset,normalizePreset,presetConfig,presetConflict,presetImageSettings,presetImagesForModel,presetPayload,validatePreset,type WorkspacePreset} from './workspacePresets';
const preset:WorkspacePreset={id:'one',name:'Автор',description:'Истории',cover:'',model_id:'test',version:2,config:{temperature:.8,stop:['STOP']},image_settings:presetImageSettings()};
describe('workspace preset snapshots',()=>{
 it('retains AI Studio levels when copying a model profile into a preset',()=>{
  const model='aistudio/gemini-3.5-flash-lite';
  expect(presetConfig(model,{}).reasoning_strength).toBe('minimal');
  expect(presetConfig(model,{modelConfigs:{[model]:{thinking:true,reasoning_strength:'medium'}}}).reasoning_strength).toBe('medium');
  expect(presetConfig(model,{modelConfigs:{[model]:{thinking:false,reasoning_strength:'high'}}}).reasoning_strength).toBe('minimal');
 });
 it('converts shared resolution and seed into actual generation parameters',()=>{expect(presetImageSettings({size:'832x1216',width:'512',height:'512',seed:'42',cfg:0})).toMatchObject({width:832,height:1216,seed:42,cfg:0})});
 it('preserves custom image dimensions',()=>{expect(presetImageSettings({size:'custom',width:'768',height:'1280',seed:'-1'})).toMatchObject({width:768,height:1280,seed:-1})});
 it('preserves old local actors and carries cloud preferences outside language configuration',()=>{
  expect(presetImageSettings({model:'saved.safetensors'}).source).toBe('local');
  const imageGeneration={source:'aistudio',local_model:'saved.safetensors',aspect_ratio:'3:4',image_size:'2K'},settings={modelConfigs:{test:{imageGeneration}}};
  expect(presetConfig('test',settings)).not.toHaveProperty('imageGeneration');
  const actor=presetImagesForModel('test',settings,{model:'keep-local.safetensors',seed:42,steps:25});
  expect(actor).toMatchObject({source:'aistudio',aspect_ratio:'3:4',image_size:'2K',model:'keep-local.safetensors',seed:42,steps:25});
  expect(presetPayload({...preset,image_settings:actor},'tab').image_settings).toEqual(actor);
 });
 it('initializes explicit local actors with the chosen checkpoint and saved profile parameters',()=>{
  expect(presetImagesForModel('test',{modelConfigs:{test:{imageGeneration:{source:'local',local_model:'chosen.safetensors'}}}},{model:'profile-default.safetensors',steps:40,cfg:4.5})).toMatchObject({source:'local',model:'chosen.safetensors',steps:40,cfg:4.5});
 });
 it('validates cloud output settings instead of inactive local dimensions',()=>{
  const valid={...preset,config:presetConfig('test',{}),image_settings:presetImageSettings({source:'aistudio',aspect_ratio:'3:4',image_size:'2K',width:1025})};
  expect(validatePreset(valid)).toBeUndefined();
  expect(validatePreset({...valid,image_settings:{...valid.image_settings,image_size:'8K'}})?.tab).toBe('images');
 });
 it('copies config without leaking connection credentials or mutating profile',()=>{const settings={apiKey:'secret',modelProfiles:{test:{systemPrompt:'Write stories'}},modelConfigs:{test:{temperature:1.2,thinking:false}},searchMode:'auto'};const config=presetConfig('test',settings);expect(config).toMatchObject({systemPrompt:'Write stories',temperature:1.2,thinking:false,searchMode:'auto'});expect(config.apiKey).toBeUndefined();config.temperature=.1;expect(settings.modelConfigs.test.temperature).toBe(1.2)});
 it('duplicates independent nested settings and clears identity',()=>{const copy=clonePreset(preset);copy.config.stop.push('END');copy.image_settings.steps=12;expect(copy.id).toBe('');expect(copy.version).toBe(0);expect(preset.config.stop).toEqual(['STOP']);expect(preset.image_settings.steps).toBe(30)});
 it('detects concurrent edits and deletion without blocking new presets',()=>{expect(presetConflict(preset,[{...preset,version:3}])).toBe(true);expect(presetConflict(preset,[])).toBe(true);expect(presetConflict(preset,[preset])).toBe(false);expect(presetConflict(clonePreset(preset),[])).toBe(false)});
 it('includes revision only for updates, never creates or copies',()=>{expect(presetPayload(preset,'tab').version).toBe(2);expect(presetPayload(clonePreset(preset),'tab')).not.toHaveProperty('version');expect(presetPayload(preset,'tab',true)).not.toHaveProperty('version');expect(presetPayload(preset,'tab')).not.toHaveProperty('id')});
 it('normalizes seed returned as a server string',()=>{expect(normalizePreset({...preset,image_settings:{...preset.image_settings,seed:'42' as unknown as number}}).image_settings.seed).toBe(42)});
 it('validates closed tab fields before sending',()=>{const valid={...preset,config:presetConfig('test',{})};expect(validatePreset(valid)).toBeUndefined();expect(validatePreset({...valid,image_settings:{...valid.image_settings,width:1025}})?.tab).toBe('images');expect(validatePreset({...valid,config:{...valid.config,temperature:Number.NaN}})?.tab).toBe('model');expect(validatePreset({...valid,config:{...valid.config,top_k:1.5}})?.tab).toBe('model')});
 it('keeps multiline stop editing possible while omitting blank lines from payload',()=>{const edited={...preset,config:{...preset.config,stop:['END','','STOP','']}};expect(presetPayload(edited,'tab').config.stop).toEqual(['END','STOP']);expect(edited.config.stop).toHaveLength(4)});
});
