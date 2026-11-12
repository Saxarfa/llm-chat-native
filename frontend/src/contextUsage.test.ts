import {describe,it,expect} from 'vitest';
import {contextUsage,contextCapacity} from './contextUsage';
import type {Message} from './types';
const answer:Message={id:'answer',role:'assistant',content:'answer',timestamp:0,model:'model',metrics:{promptTokens:1200,tokens:300,contextSize:4096,estimated:false}};
describe('context usage',()=>{
 it('prefers the current worker or launch window over old answer metrics and profile defaults',()=>{
  expect(contextCapacity({runtime:65536,configured:8192,historical:8192})).toBe(65536);
  expect(contextCapacity({runtime:32768,measured:65536,configured:8192,historical:8192})).toBe(32768);
  expect(contextCapacity({measured:65536,configured:8192,historical:8192})).toBe(65536);
  expect(contextCapacity({configured:65536,historical:8192})).toBe(65536);
 });
 it('keeps a streaming request’s actual window and rejects invalid limits',()=>{
  expect(contextCapacity({live:32768,runtime:65536})).toBe(32768);
  expect(contextCapacity({runtime:NaN,measured:0,configured:-1})).toBeUndefined();
  expect(contextCapacity({historical:16384})).toBe(16384);
 });
 it('uses prompt and answer tokens together',()=>{expect(contextUsage([answer],'model','')).toEqual({used:1500,capacity:4096,estimated:false})});
 it('estimates new messages beyond the last measured answer',()=>{expect(contextUsage([answer,{id:'q',role:'user',content:'abcdef',timestamp:0}],'model','').used).toBe(1506)});
 it('does not borrow another model’s capacity',()=>{const usage=contextUsage([answer],'other','');expect(usage.capacity).toBeUndefined();expect(usage.estimated).toBe(true)});
 it('excludes the previous answer during regeneration',()=>{expect(contextUsage([answer],'model','',{chat_id:'chat',target_message_id:'answer',text:'abcdef'}).used).toBe(6)});
 it('does not add historical tool generations to the current context',()=>{
  const message={...answer,metrics:{...answer.metrics,statsVersion:2,tokens:900,lastCompletionTokens:100}};
  expect(contextUsage([message],'model','').used).toBe(1300);
 });
 it('uses the current tool request while streaming',()=>{
  expect(contextUsage([answer],'model','',{chat_id:'chat',contextUsed:2100,contextSize:32768,contextEstimated:false,text:'ignored'})).toEqual({used:2100,capacity:32768,estimated:false});
 });
});
