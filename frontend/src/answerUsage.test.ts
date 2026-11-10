import {describe,it,expect} from 'vitest';
import {answerUsage} from './answerUsage';
describe('answer accounting',()=>{
 it('does not present legacy one-token answers as exact',()=>{
  const value=answerUsage({content:'Длинный ответ '.repeat(500),reasoning:'Рассуждение '.repeat(200),metrics:{tokens:1,estimated:false,speed:0,previousToolTokens:3347}});
  expect(value.tokens).toBeGreaterThan(1);expect(value.estimated).toBe(true);expect(value.responseEstimated).toBe(true);expect(value.speed).toBeUndefined();
 });
 it('includes earlier tool rounds in legacy totals',()=>{
  expect(answerUsage({content:'Ответ',metrics:{tokens:200,previousToolTokens:30,estimated:false}}).tokens).toBe(230);
 });
 it('preserves separately measured new statistics',()=>{
  const metrics={statsVersion:2,tokens:90,responseTokens:15,responseEstimated:false,lastCompletionTokens:60};
  expect(answerUsage({content:'text',metrics})).toEqual(metrics);
 });
});
