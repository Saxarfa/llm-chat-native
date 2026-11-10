import type {ReactNode} from 'react';
import {TooltipProvider} from './ui/tooltip';
import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup as renderRaw} from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import {CodeBlock} from './CodeBlock';
vi.mock('./primitives',()=>({CopyButton:({text}:{text:string})=><button data-copy={text}/> }));
vi.mock('../store',()=>({download:vi.fn()}));

const renderToStaticMarkup=(node:ReactNode)=>renderRaw(<TooltipProvider>{node}</TooltipProvider>);
const render=(lines:number,closed=true)=>renderToStaticMarkup(<ReactMarkdown components={{pre:CodeBlock}}>{'```python\n'+Array.from({length:lines},(_,i)=>`print(${i})`).join('\n')+(closed?'\n```':'')}</ReactMarkdown>);
describe('code spoilers',()=>{
 it('renders prompts as literal copyable text without code decorations',()=>{
  const prompt='cinematic lighting, **soft shadows**, $50, [reference], <lora:detail:0.8>\nsecond line';
  const html=renderToStaticMarkup(<ReactMarkdown components={{pre:CodeBlock}}>{'```prompt\n'+prompt+'\n```'}</ReactMarkdown>);
  expect(html).toContain('text-panel');expect(html).toContain('Промпт');expect(html).toContain('data-copy="'+prompt.replace('<','&lt;').replace('>','&gt;')+'"');
  expect(html).not.toContain('code-line-numbers');expect(html).not.toContain('code-file-format');expect(html).not.toContain('<strong>');expect(html).toContain('**soft shadows**');
 });
 it('separates negative prompts and supports unfinished streaming text blocks',()=>{
  for(const language of ['negative_prompt','system_prompt','text','']){
   const html=renderToStaticMarkup(<ReactMarkdown components={{pre:CodeBlock}}>{'```'+language+'\nfirst line\nsecond line'}</ReactMarkdown>);
   expect(html).toContain('text-panel');expect(html).toContain('data-copy="first line\nsecond line"');expect(html).not.toContain('code-line-numbers');
  }
 });
 it('skips leading blank lines visually while copying the original and keeping source line numbers',()=>{
  const code='\n \n\t\n\n\n'+Array.from({length:14},(_,i)=>`print(${i})`).join('\n');
  const html=renderToStaticMarkup(<ReactMarkdown components={{pre:CodeBlock}}>{'```python\n'+code+'\n```'}</ReactMarkdown>);
  expect(html).toContain('<code class="language-python">print(0)');
  expect(html).toContain('aria-hidden="true"><span>6</span>');
  expect(html).toContain('--code-preview-lines:6');
  expect(html).toContain('data-copy="'+code+'"');
 });
 it('numbers all lines without putting numbers inside the code and offers a download',()=>{const html=render(10);expect(html).toContain('code-line-numbers');expect(html).toContain('<span>10</span>');expect(html).toContain('aria-label="Другие действия"');expect(html).not.toContain('code-download-button');expect(html).toContain('print(0)\nprint(1)')});
 it('counts nonempty lines while preserving blank lines and fading the last two',()=>{
  const code=['one','two','','three','','four','five','','six','seven','eight','nine'];
  const html=renderToStaticMarkup(<ReactMarkdown components={{pre:CodeBlock}}>{'```text\n'+code.join('\n')+'\n```'}</ReactMarkdown>);
  expect(html).toContain('one\ntwo\n\nthree\n\nfour\nfive\n\nsix');expect(html).toContain('--code-preview-lines:9');expect(html).toContain('--code-fade-lines:3');
 });
 it('keeps ten lines visible',()=>{const html=render(10);expect(html).not.toContain('hidden=""');expect(html).not.toContain('code-spoiler-button');expect(html).toContain('print(9)')});
 it('clips one stable code element to six nonempty lines, including an unfinished streaming fence',()=>{for(const closed of [true,false]){const html=render(11,closed);expect(html).not.toContain('hidden=""');expect(html).toContain('aria-expanded="false"');expect(html).toContain('11 строк');expect(html).toContain('print(10)');expect(html.match(/<pre\b/g)).toHaveLength(1);expect(html).toContain('--code-preview-lines:6');expect(html).toContain('--code-fade-lines:2');expect(html).toContain('Показать код полностью')}});
});
