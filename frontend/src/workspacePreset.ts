import type {Values} from './types';
import type {KnowledgeSelection} from './knowledge';

export type PresetSnapshot = {id:string;name:string;greeting?:string;cover:string;model_id:string;config:Values;image_settings:Values;knowledge?:KnowledgeSelection};

export function presetOverrides(preset:PresetSnapshot):Values {
 return structuredClone({
  [preset.model_id]:preset.config,
  searchMode:preset.config.searchMode??'disabled',
  workspacePreset:{id:preset.id,name:preset.name,greeting:preset.greeting||'',cover:preset.cover,model_id:preset.model_id},
  imageSettings:preset.image_settings,
  ...(preset.knowledge?{knowledge:preset.knowledge}:{}),
 });
}

// Presentation is local to this conversation. The underlying inference ID never changes.
export function presetPresentation(settings:Values,overrides:Values):Values {
 const preset=overrides.workspacePreset;
 if(!preset?.model_id)return settings;
 return {...settings,modelProfiles:{...settings.modelProfiles,[preset.model_id]:{
  ...settings.modelProfiles?.[preset.model_id],alias:preset.name,avatar:preset.cover,
 }}};
}

export function withoutPreset(overrides:Values):Values {
 const result={...overrides},preset=result.workspacePreset;
 if(preset){delete result[preset.model_id];delete result.workspacePreset;delete result.imageSettings;delete result.searchMode;delete result.knowledge}
 return result;
}
