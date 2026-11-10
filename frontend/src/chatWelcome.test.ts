import {describe,expect,it} from 'vitest';
import {personalWelcome} from './chatWelcome';

describe('personalWelcome',()=>{
 it('keeps phone greetings short, desktop greetings unrestricted',()=>{
  const phone=new Set<string>(),desktop=new Set<string>();
  for(let v=0;v<64;v++){phone.add(personalWelcome('Saxara',10,v,24));desktop.add(personalWelcome('Saxara',10,v))}
  expect([...phone].every(t=>t.length<=24)).toBe(true);
  expect(phone.size).toBeGreaterThan(10);
  expect([...desktop].some(t=>t.length>24)).toBe(true);
 });
 it('falls back to the full set when a long nick leaves nothing short',()=>{
  expect(personalWelcome('x'.repeat(40),10,0,4)).toBeTruthy();
 });
});
