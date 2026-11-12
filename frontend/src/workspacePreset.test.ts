import {expect,it} from 'vitest';
import {configFor} from './domain';
import {presetOverrides,presetPresentation,withoutPreset} from './workspacePreset';

it('freezes a preset in its conversation without mutating the preset or defaults',()=>{
 const preset={id:'p',name:'Автор',cover:'data:image/png;base64,a',model_id:'real-model',config:{temperature:.4,systemPrompt:'Write stories',stop:['END'],searchMode:'auto'},image_settings:{width:832,height:1216,steps:30,cfg:4}};
 const overrides=presetOverrides(preset);
 preset.config.temperature=.9;preset.config.stop.push('STOP');preset.image_settings.steps=12;
 expect(configFor('real-model',{modelConfigs:{'real-model':{temperature:1.5}}},overrides).temperature).toBe(.4);
 expect(overrides['real-model'].stop).toEqual(['END']);
 expect(overrides.imageSettings.steps).toBe(30);
 expect(overrides.searchMode).toBe('auto');
});

it('changes only the conversation display identity and keeps other model identities',()=>{
 const settings={modelProfiles:{m:{alias:'Original',avatar:'old',systemPrompt:'Keep'},other:{alias:'Other'}}};
 const presentation=presetPresentation(settings,{workspacePreset:{model_id:'m',name:'Writer',cover:'cover'}});
 expect(presentation.modelProfiles.m).toEqual({alias:'Writer',avatar:'cover',systemPrompt:'Keep'});
 expect(presentation.modelProfiles.other.alias).toBe('Other');
 expect(settings.modelProfiles.m.alias).toBe('Original');
});

it('keeps the greeting in the frozen actor identity, outside model parameters',()=>{
 const preset={id:'p',name:'Автор',greeting:'Заходи, расскажу историю.',cover:'',model_id:'m',config:{temperature:.4},image_settings:{steps:30}};
 const overrides=presetOverrides(preset);preset.greeting='Изменено';
 expect(overrides.workspacePreset.greeting).toBe('Заходи, расскажу историю.');expect(overrides.m.greeting).toBeUndefined();
});


it('removes actor settings when returning to a plain model and preserves unrelated overrides',()=>{
 const value:Record<string,any>={...presetOverrides({id:'p',name:'Writer',cover:'',model_id:'m',config:{temperature:.3},image_settings:{steps:20}}),other:{temperature:.8},memoryEnabled:false};
 expect(withoutPreset(value)).toEqual({other:{temperature:.8},memoryEnabled:false});
 expect(value.workspacePreset.id).toBe('p');
 expect(withoutPreset({m:{temperature:.7},searchMode:'auto'})).toEqual({m:{temperature:.7},searchMode:'auto'});
});
