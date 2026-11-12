import {describe,expect,it} from 'vitest';
import {selectedTextPrompt,selectionSourceLanguage,selectionToolbarPosition} from './selectedText';

describe('selected answer actions',()=>{
 it('keeps the complete quote and the follow-up question separate',()=>{
  const quote='Первая строка\n\nconst value = "<tag>";';
  const prompt=selectedTextPrompt(quote,'  Почему так?  ');
  expect(prompt).toContain('> Первая строка\n> \n> const value = "<tag>";');
  expect(prompt.endsWith('\n\nПочему так?')).toBe(true);
  expect(selectedTextPrompt(quote)).toContain('Объясни этот фрагмент');
 });
 it('selects the existing translator direction for Russian and English fragments',()=>{
  expect(selectionSourceLanguage('This is a text for translation')).toBe('en');
  expect(selectionSourceLanguage('Объяснение функции request()')).toBe('ru');
 });
 it('keeps a toolbar inside a narrow viewport at either horizontal edge',()=>{
  const viewport={left:0,top:0,width:390,height:844},size={width:340,height:50};
  for(const x of [0,380]){
   const position=selectionToolbarPosition({left:x,right:x+8,top:100,bottom:120,width:8,height:20},size,viewport);
   expect(position.left).toBeGreaterThanOrEqual(12);
   expect(position.left+size.width).toBeLessThanOrEqual(378);
   expect(position.top).toBe(129);
  }
 });
 it('places the toolbar above a low selection and respects a shifted mobile viewport',()=>{
  const viewport={left:10,top:150,width:390,height:400};
  const position=selectionToolbarPosition({left:100,right:150,top:510,bottom:530,width:50,height:20},{width:340,height:50},viewport);
  expect(position).toEqual({left:22,top:451});
 });
});
