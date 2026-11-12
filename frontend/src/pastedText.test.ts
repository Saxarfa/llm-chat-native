import {describe,it,expect} from 'vitest';
import {isLargePaste,composePastedMessage} from './pastedText';

describe('pasted text content',()=>{
 it('keeps short messages in the input and groups large prose or multiline text',()=>{
  expect(isLargePaste('Короткий вопрос')).toBe(false);
  expect(isLargePaste('а'.repeat(1200))).toBe(true);
  expect(isLargePaste(('    const value = 1234567890;\n').repeat(12))).toBe(true);
  expect(isLargePaste('\n'.repeat(20))).toBe(false);
 });
 it('sends the complete pasted text without trimming code or whitespace',()=>{
  const code='\n  function example() {\r\n    return 42;\r\n  }\n';
  expect(composePastedMessage('Проверь код',[code])).toBe('Проверь код\n\n'+code);
  expect(composePastedMessage('',[code])).toBe(code);
  expect(composePastedMessage('Вопрос',['первый','второй'])).toBe('Вопрос\n\nпервый\n\nвторой');
 });
});
