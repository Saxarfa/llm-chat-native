import {describe,it,expect} from 'vitest';
import {configFor,modelName,safeUrl,safeStreamEnd,displayedMessages,reasoningKind,reasoningStrength,subscriptionLevels,studioOutputLimit,parameterSupported} from './domain';

describe('AI Studio reasoning levels',()=>{
 const gemma='aistudio/gemma-4-31b-it',moe='aistudio/gemma-4-26b-a4b-it',flash='aistudio/gemini-3.8-flash',lite='aistudio/gemini-3.5-flash-lite',argon='aistudio/gemini-4-argon';
 it('offers only the levels present in each model catalog',()=>{
  expect(subscriptionLevels(gemma)?.map(([value])=>value)).toEqual(['minimal','high']);
  expect(subscriptionLevels(moe)?.map(([value])=>value)).toEqual(['minimal','high']);
  expect(subscriptionLevels(flash)?.map(([value])=>value)).toEqual(['low','medium','high']);
  expect(subscriptionLevels(lite)?.map(([value])=>value)).toEqual(['minimal','low','medium','high']);
  expect(subscriptionLevels(argon)?.map(([value])=>value)).toEqual(['low','medium','high']);
  expect(modelName(argon,{})).toBe('Gemini 4 Argon');
  expect(studioOutputLimit(argon)).toBe(32768);
  const carbon='aistudio/gemini-4-carbon';
  expect(modelName(carbon,{})).toBe('Gemini 4 Carbon');
  expect(subscriptionLevels(carbon)?.map(([value])=>value)).toEqual(['low','medium','high']);
  expect(reasoningStrength(carbon,{reasoning_strength:'minimal'})).toBe('low');
  expect(parameterSupported(carbon,'temperature')).toBe(false);
  expect(studioOutputLimit(flash)).toBe(65536);
  for(const model of [gemma,moe,flash,lite,argon])expect(reasoningKind(model)).toBe('effort');
 });
 it('preserves earlier on/off choices and uses catalog defaults for unset profiles',()=>{
  for(const model of [gemma,moe,flash,lite,argon]){
   const settings={modelConfigs:{[model]:{thinking:false}}};
   expect(configFor(model,settings).reasoning_strength).toBe(model===flash||model===argon?'low':'minimal');
   expect(configFor(model,{}).reasoning_strength).toBe(model===flash||model===argon?'medium':model===lite?'minimal':'high');
   expect(configFor(model,{modelConfigs:{[model]:{thinking:true}}}).reasoning_strength).toBe('high');
   expect(settings.modelConfigs[model]).toEqual({thinking:false});
  }
 });
 it('lets a chosen level override the retired toggle in every chat',()=>{
  for(const model of [gemma,moe,flash,lite,argon]){
   const levels=subscriptionLevels(model)!;
   for(const [strength] of levels){
    const config=configFor(model,{modelConfigs:{[model]:{thinking:true,reasoning_strength:strength}}});
    expect(config.reasoning_strength).toBe(strength);
    expect(reasoningStrength(model,config)).toBe(strength);
   }
  }
  expect(configFor(lite,{modelConfigs:{[lite]:{reasoning_strength:'high'}}},{[lite]:{reasoning_strength:'medium'}}).reasoning_strength).toBe('medium');
 });
 it('matches the bridge conversion when importing an unsupported effort',()=>{
  expect(reasoningStrength(gemma,{reasoning_strength:'low'})).toBe('minimal');
  expect(reasoningStrength(gemma,{reasoning_strength:'medium'})).toBe('high');
  expect(reasoningStrength(flash,{reasoning_strength:'minimal'})).toBe('low');
  expect(reasoningStrength(argon,{reasoning_strength:'minimal'})).toBe('low');
  expect(reasoningStrength(gemma,{thinking:false,reasoning_strength:'high'})).toBe('minimal');
 });
});
describe('profile and chat boundaries',()=>{
 it('ignores retired sampling values in saved profiles and chat overrides',()=>{
  const settings={modelConfigs:{m:{mirostat:2,mirostat_tau:5,temperature:.8}}};
  const overrides={m:{mirostat_eta:.1,temperature:.2}};
  const config=configFor('m',settings,overrides);
  expect(config.temperature).toBe(.2);
  for(const key of ['mirostat','mirostat_tau','mirostat_eta'])expect(config).not.toHaveProperty(key);
  expect(settings.modelConfigs.m.mirostat).toBe(2);
 });
 it('inherits without creating or mutating profiles',()=>{
  const settings={modelConfigs:{gemma:{temperature:.8,top_p:.93}},modelProfiles:{gemma:{alias:'Моя Gemma'}}};
  const before=JSON.stringify(settings);
  expect(configFor('gemma',settings,{gemma:{temperature:.2}})).toMatchObject({temperature:.2,top_p:.93});
  expect(configFor('gemma',settings).temperature).toBe(.8);
  configFor('unknown',settings);
  expect(JSON.stringify(settings)).toBe(before);
  expect(modelName('gemma',settings)).toBe('Моя Gemma');
 });
 it('retains legacy profile prompts and stop sequences',()=>{
  expect(configFor('m',{modelProfiles:{m:{systemPrompt:'Custom'}}}).systemPrompt).toBe('Custom');
  expect(configFor('m',{modelConfigs:{m:{stop:'END, STOP'}}}).stop).toEqual(['END','STOP']);
 });
 it('keeps a regenerated response in its original position with later turns intact',()=>{
  const messages=[{id:'u',role:'user'},{id:'a',role:'assistant'},{id:'u2',role:'user'}] as any;
  expect(displayedMessages({messages} as any,{chat_id:'c',target_message_id:'a'}).map(m=>m.id)).toEqual(['u','a','u2']);
 });
});
describe('untrusted model output',()=>{
 it('does not turn executable or local URLs into links',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,test','file:///C:/secret'])expect(safeUrl(url)).toBeUndefined();
  expect(safeUrl('https://example.com')).toBe('https://example.com/');
 });
 it('does not split a surrogate pair during streamed rendering',()=>{
  const text='A🌍B';expect(text.slice(0,safeStreamEnd(text,2))).toBe('A🌍');
  expect(safeStreamEnd(text,4)).toBe(4);
 });
});
