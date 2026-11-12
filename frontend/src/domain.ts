import type {Values,Chat,Message,Live} from './types';
// Nano Banana image models of AI Studio, used as ordinary chat models.
export const omni12Model='aistudio/gemini-omni-1.2-flash';
export const isOmniModel=(model?:string)=>model===omni12Model||model==='aistudio/gemini-omni-1.1-flash';
export const omniResolutions=['360p','720p','1080p','4k'];
export const omniDurations=[3,4,5,6,7,8,9,10];
export const omniDurationsFor=(model:string)=>model===omni12Model?[...omniDurations,11,12,13,14,15]:omniDurations;
export const omniTasks=[['auto','Авто'],['text_to_video','Из текста'],['image_to_video','Из картинки'],['reference_to_video','По образцам'],['edit','Правка видео'],['extend','Продление видео']] as const;
const nanoNames:Record<string,string>={'aistudio/gemini-omni-1.1-flash':'Gemini Omni 1.1 Flash','aistudio/gemini-nano-banana-2.1':'Nano Banana 2.1','aistudio/gemini-3.1-flash-image':'Nano Banana 2','aistudio/gemini-3.1-flash-lite-image':'Nano Banana 2 Lite','aistudio/gemini-3-pro-image':'Nano Banana Pro','aistudio/gemini-2.5-flash-image':'Nano Banana'};
nanoNames[omni12Model]='Gemini Omni 1.2 Flash';
export const isNanoModel=(model?:string)=>!!model&&Object.hasOwn(nanoNames,model);
/** Per-model controls of AI Studio's run settings (checked 2026-11-10). */
export const nanoThinkingLevels:Record<string,[string,string][]>={'aistudio/gemini-nano-banana-2.1':[['minimal','Минимальные'],['medium','Средние'],['high','Глубокие']],'aistudio/gemini-3.1-flash-image':[['minimal','Минимальные'],['high','Глубокие']],'aistudio/gemini-3.1-flash-lite-image':[['minimal','Минимальные'],['high','Глубокие']]};
nanoThinkingLevels['aistudio/gemini-omni-1.1-flash']=[['low','Low'],['high','High']];
/** Sampling and text limits AI Studio offers per image model (Playground, 2026-11-10). */
export const nanoSampling=(model:string)=>({temperature:['aistudio/gemini-3.1-flash-image','aistudio/gemini-3.1-flash-lite-image','aistudio/gemini-3-pro-image','aistudio/gemini-2.5-flash-image'].includes(model),topP:['aistudio/gemini-3.1-flash-image','aistudio/gemini-3-pro-image'].includes(model),textLimits:model==='aistudio/gemini-nano-banana-2.1'||model===omni12Model});
export const nanoOutputFormat=(model:string)=>['aistudio/gemini-nano-banana-2.1','aistudio/gemini-3.1-flash-image','aistudio/gemini-3.1-flash-lite-image'].includes(model);
const studioNames:Record<string,string>={'aistudio/gemma-4-31b-it':'Gemma 4 31B','aistudio/gemma-4-26b-a4b-it':'Gemma 4 26B A4B','aistudio/gemini-3.8-flash':'Gemini 3.8 Flash','aistudio/gemini-3.5-flash-lite':'Gemini 3.5 Flash-Lite','aistudio/gemini-4-argon':'Gemini 4 Argon','aistudio/gemini-4-carbon':'Gemini 4 Carbon',...nanoNames};
export const studioOutputLimit=(model:string)=>['aistudio/gemini-3.8-flash','aistudio/gemini-3.5-flash-lite'].includes(model)?65536:32768;
// AI Studio ListModels thinking configuration, verified against the connected account.
// Gemma supports two levels; Flash and Flash-Lite have different minimum levels.
const studioLevels:Record<string,string[][]>={
 'aistudio/gemma-4-31b-it':[['minimal','Минимальный'],['high','Высокий']],
 'aistudio/gemma-4-26b-a4b-it':[['minimal','Минимальный'],['high','Высокий']],
 'aistudio/gemini-3.8-flash':[['low','Низкий'],['medium','Средний'],['high','Высокий']],
 'aistudio/gemini-3.5-flash-lite':[['minimal','Минимальный'],['low','Низкий'],['medium','Средний'],['high','Высокий']],
 'aistudio/gemini-4-argon':[['low','Низкий'],['medium','Средний'],['high','Высокий']],
 'aistudio/gemini-4-carbon':[['low','Низкий'],['medium','Средний'],['high','Высокий']],
};
const studioDefaultStrength:Record<string,string>={'aistudio/gemini-3.8-flash':'medium','aistudio/gemini-3.5-flash-lite':'minimal','aistudio/gemini-4-argon':'medium','aistudio/gemini-4-carbon':'medium'};
export function reasoningStrength(model:string,config:Values){
 const studio=!!studioLevels[model];
 const strength=studio&&config.thinking===false?'minimal':config.reasoning_strength||(studio&&config.thinking!==true?studioDefaultStrength[model]:undefined)||'high';
 const levels=studioLevels[model];if(!levels||levels.some(([value])=>value===strength))return strength;
 if(['aistudio/gemini-3.8-flash','aistudio/gemini-4-argon','aistudio/gemini-4-carbon'].includes(model)&&strength==='minimal')return 'low';
 if(model.startsWith('aistudio/gemma-4-')&&strength==='low')return 'minimal';
 return 'high';
}
export const defaults:Values={temperature:.7,top_p:.9,min_p:.05,top_k:40,repeat_penalty:1.1,presence_penalty:0,frequency_penalty:0,max_tokens:-1,systemPrompt:'You are a helpful, knowledgeable, and precise AI assistant. Provide concise, high-quality answers formatted in Markdown. When writing code, specify the language and follow modern best practices.',stop:[]};
export function modelName(id:string,settings:Values){if(id.startsWith('gemini-web/')&&!settings.modelProfiles?.[id]?.alias)return 'Gemini '+id.slice(11).replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).replace('Flash Lite','Flash-Lite');if(id.startsWith('aistudio/')&&!settings.modelProfiles?.[id]?.alias)return studioNames[id]||id.slice(9);if(id==='qwen-3.6-35b-a3b-mtp'&&!settings.modelProfiles?.[id]?.alias)return 'Qwen 3.6 35B-A3B MTP';if(id==='gemma-4-e4b-uncensored'&&!settings.modelProfiles?.[id]?.alias)return 'Gemma 4 E4B Uncensored';if(id==='gemma-12b-uncensored'&&!settings.modelProfiles?.[id]?.alias)return 'Gemma 12B Abliterix';if(id==='gemma-26b-uncensored'&&!settings.modelProfiles?.[id]?.alias)return 'Gemma 26B Abliterix V6';return settings.modelProfiles?.[id]?.alias || id.replace(/^google-subscription\//,'Подписка · ').replace(/^google\//,'Google · ').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).replace(/\b(\d+)b\b/gi,'$1B').replace(/\bqat\b/gi,'QAT').replace(/\biq(\d)/gi,'IQ$1');}
export function configFor(model:string,settings:Values,overrides:Values={}){
 // Abliterix releases retain the existing 12B and 26B chat IDs.
 // Saved per-model settings and chat overrides still take precedence.
 const modelDefaults=model.startsWith('aistudio/')?{temperature:1,top_p:.95,top_k:64,thinking:true,max_tokens:32768}:model==='gemma-12b-uncensored'?{temperature:.7,top_p:.9,min_p:.05,top_k:64,repeat_penalty:1}:model==='gemma-26b-uncensored'?{temperature:1,top_p:.95,min_p:0,top_k:64,repeat_penalty:1}:model==='gemma-4-e4b-uncensored'?{temperature:1,top_p:.95,min_p:0,top_k:64,repeat_penalty:1,presence_penalty:0,frequency_penalty:0,thinking:true,max_tokens:512}:model==='qwen-3.6-35b-a3b-mtp'?{temperature:1,top_p:.95,min_p:0,top_k:20,repeat_penalty:1,presence_penalty:1.5,frequency_penalty:0,max_tokens:16384,thinking:true}:{};
 const config={...defaults,...modelDefaults,systemPrompt:settings.modelProfiles?.[model]?.systemPrompt??settings.systemPrompt??defaults.systemPrompt,...settings.modelConfigs?.[model],...overrides[model]};
 if((model.startsWith('google-subscription/')||model.startsWith('gemini-web/'))&&!config.reasoning_strength)config.reasoning_strength=model.match(/-(low|medium|high)$/)?.[1]||'high';
 if(studioLevels[model])config.reasoning_strength=reasoningStrength(model,{...settings.modelConfigs?.[model],...overrides[model]});
 // Ignore retired values still present in saved profiles and chat overrides.
 delete config.mirostat;delete config.mirostat_tau;delete config.mirostat_eta;
 const stop=config.stop?.length?config.stop:config.stop_tokens;
 config.stop=Array.isArray(stop)?stop:typeof stop==='string'?stop.split(',').map(v=>v.trim()).filter(Boolean):[];
 return config;
}
export function clockContext(){let zone='';try{zone=Intl.DateTimeFormat().resolvedOptions().timeZone}catch{}return {client_timezone:zone,client_utc_offset_minutes:-new Date().getTimezoneOffset()};}
export function displayedMessages(chat:Chat|undefined,live:Live|undefined):Message[]{const messages=chat?.messages || [];return messages;}
export function mergeChat(chats:Chat[],chat:Chat){return [chat,...chats.filter(c=>c.id!==chat.id)].sort((a,b)=>b.updatedAt-a.updatedAt);}
export const safeImage=(src?:string)=>!!src && /^(data:image\/(png|jpeg|webp|gif|svg\+xml);|https?:\/\/)/i.test(src);
export function safeUrl(url:string){try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.href:undefined}catch{return undefined}}
export function safeStreamEnd(text:string,end:number){return end<text.length && /[\uD800-\uDBFF]/.test(text[end-1])?end+1:end;}

export function subscriptionLevels(model:string){if(studioLevels[model])return studioLevels[model];if(model.startsWith('gemini-web/'))return [['low','Низкий'],['medium','Средний'],['high','Высокий']];return model.startsWith('google-subscription/')?(model.includes('-pro')?[['low','Лёгкие'],['high','Глубокие']]:[['low','Лёгкие'],['medium','Средние'],['high','Глубокие']]):null;}
export function reasoningKind(model:string){if(model.startsWith('gemini-web/')||studioLevels[model])return 'effort';return model.startsWith('google-subscription/')?'effort':['gemma-31b-iq3','gemma-26b-uncensored','gemma-26b-qat','gemma-12b-uncensored','gemma-4-e4b-uncensored','qwen-3.8-27b-it','qwen-3.6-35b-a3b-mtp'].includes(model)?'toggle':['muse-glimmer-30b'].includes(model)?'effort':null;}

export function parameterSupported(model:string,key:string){if(isNanoModel(model))return false;if(model==='aistudio/gemini-4-argon'||model==='aistudio/gemini-4-carbon'||model.startsWith('gemini-web/'))return false;return !model.startsWith('aistudio/')||['temperature','top_p','top_k','max_tokens'].includes(key)}
