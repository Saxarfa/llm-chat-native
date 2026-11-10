import type {ReactNode} from 'react';
import {TooltipProvider} from './ui/tooltip';
import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Markdown,preparedMarkdown} from './Messages';
import {SearchHighlightContext} from '../chatSearch';
import {sourceCitations} from '../citations';
import {highlightSearch} from '../chatSearch';
import {streamReveal} from '../streamReveal';

vi.mock('../store',()=>({download:vi.fn(),forkBranch:vi.fn(),chooseVariant:vi.fn(),editMessage:vi.fn(),regenerate:vi.fn(),failure:vi.fn(),useChat:()=>({settings:{}})}));
const render=(element:ReactNode)=>renderToStaticMarkup(<TooltipProvider>{element}</TooltipProvider>);
const formula=String.raw`T = \frac{\hbar c^3}{8\pi G M k_B}`;

describe('answer math rendering',()=>{
 it('keeps dollar prices as prose without swallowing spaces, emphasis or links',()=>{
  const text='Проверка от $0 до $1. Депозит **$10, $30 или $50**, подарок $300 Google Cloud.\n\n'+
   'Лимит (~$2) и $30–50 — обычные суммы. [Источник](https://example.com/$300).';
  for(const streaming of [false,true]){
   const html=render(<Markdown text={text} streaming={streaming}/>);
   expect(html).not.toContain('class="katex"');
   expect(html).toContain('<strong>$10, $30 или $50</strong>');
   expect(html).toContain('$300 Google Cloud');
   expect(html).toContain('$30–50');
   expect(html).toContain('href="https://example.com/$300"');
   expect(html).not.toMatch(/[\ue000-\uf8ff]/);
  }
 });
 it('supports numeric math alongside prices and preserves code dollars',()=>{
  const html=render(<Markdown text={'Цена $10 и $30, **депозит $50**, формулы $2 + 2$, $2x$, $2$, $2 \\pi$ и $x^2$. `echo $300`'}/>);
  expect(html.match(/class="katex"/g)).toHaveLength(5);
  expect(html).toContain('Цена $10 и $30, <strong>депозит $50</strong>, формулы');
  expect(html).toContain('<code>echo $300</code>');
 });
 it('reuses prepared tables and math while keeping edits, links and search current',()=>{
  preparedMarkdown.clear();
  const cacheKey={},text='| ??????? | ????? |\n|---|---|\n| $|x|$ | ????? [??????](https://example.com) |';
  const html=render(<Markdown text={text} cacheKey={cacheKey}/>);
  expect(render(<Markdown text={text} cacheKey={cacheKey}/>)).toBe(html);
  expect(html).toContain('class="katex"');expect(html).toContain('?????');
  expect(render(<Markdown text={text.replace('?????','??????')} cacheKey={cacheKey}/>)).toContain('??????');
  const search=render(<SearchHighlightContext.Provider value="?????"><Markdown text={text} cacheKey={cacheKey}/></SearchHighlightContext.Provider>);
  expect(search).toContain('<mark');expect(search).toContain('class="katex"');
  expect(render(<Markdown text={text} cacheKey={cacheKey}/>)).not.toContain('<mark');
  const unsafe=render(<Markdown text={String.raw`$\href{javascript:alert(1)}{click}$`} cacheKey={cacheKey}/>);
  expect(unsafe).not.toContain('href="javascript:');
  preparedMarkdown.clear();
 });

 it('preserves absolute values and the rest of each table cell',()=>{
  const text=String.raw`| Модель | Почему проходит |
|---|---|
| A | Наклон $|V'|/V = 2/\phi$ достаточен. |
| B | Потенциал $V \sim \phi^p$, наклон $|V'|/V = p/\phi$. Остальной текст. |`;
  const html=render(<Markdown text={text}/>);
  expect(html.match(/<td>/g)).toHaveLength(4);
  expect(html.match(/class="katex"/g)).toHaveLength(3);
  expect(html).toContain('достаточен.');
  expect(html).toContain('Остальной текст.');
  expect(html).not.toContain('$');
 });
 it('preserves TeX norm delimiters and array column rules in table formulas',()=>{
  const text=String.raw`| Формула | Описание |
|---|---|
| $\|x\|$ | Норма |
| $\begin{array}{c|c}a&b\end{array}$ | Таблица внутри формулы |`;
  const html=render(<Markdown text={text}/>);
  expect(html.match(/<td>/g)).toHaveLength(4);
  expect(html).toContain(String.raw`\|x\|`);
  expect(html).toContain(String.raw`\begin{array}{c|c}`);
  expect(html).not.toContain('katex-error');
 });
 it('leaves code, currency columns and ordinary table separators intact',()=>{
  const text='| Цена | Ещё цена |\n|---|---|\n| $5 | $10 |\n\n`$a|b$`\n\n```text\n$x|y$\n```';
  const html=render(<Markdown text={text}/>);
  expect(html).toContain('<td>$5</td>');
  expect(html).toContain('<td>$10</td>');
  expect(html).toContain('<code>$a|b$</code>');
  expect(html).toContain('$x|y$');
 });
 it('preserves private-use characters, source links and math during streaming',()=>{
  const text='| Формула | Текст |\n|---|---|\n| $|x|$ | \ue000 [1] Хвост |';
  for(const streaming of [false,true]){
   const html=render(<Markdown text={text} streaming={streaming} sources={[{title:'Source',url:'https://example.com'}]}/>);
   expect(html).toContain('class="katex"');
   expect(html).toContain('\ue000');
   expect(html).not.toContain('\ue001');
   expect(html).toContain('Хвост');
  }
  expect(()=>render(<Markdown text={'| Формула |\n|---|\n| $|x'} streaming/>)).not.toThrow();
 });
 it('renders the reported single-line block equation with fraction layout and accessible MathML',()=>{
  const html=render(<Markdown text={'Температура:\n\n$$'+formula+'$$\n\nЧем меньше масса, тем горячее.'}/>);
  expect(html).toContain('class="katex-display"');
  expect(html).toContain('<math');
  expect(html).toContain('<mfrac>');
  expect(html).toContain('encoding="application/x-tex"');
  expect(html).toMatch(/style="[^"]*(height|top):/);
  expect(html).not.toContain('$$');
  expect(html).toContain('Чем меньше масса, тем горячее.');
 });
 it('supports inline and multiline equations alongside links and code',()=>{
  const html=render(<Markdown text={'Текст $x^2$ и [ссылка](https://example.com).\n\n$$\n'+formula+'\n$$\n\n`$x^2$`\n\n```text\n$$literal$$\n```'}/>);
  expect(html.match(/class="katex-display"/g)).toHaveLength(1);
  expect(html.match(/class="katex"/g)).toHaveLength(2);
  expect(html).toContain('href="https://example.com/"');
  expect(html).toContain('<code>$x^2$</code>');
  expect(html).toContain('$$literal$$');
 });
 it('keeps double-dollar expressions within ordinary paragraphs inline',()=>{
  const html=render(<Markdown text={'Значение $$x^2$$ находится здесь.'}/>);
  expect(html).toContain('class="katex"');
  expect(html).not.toContain('katex-display');
 });
 it('preserves formula layout while prose is streamed or highlighted',()=>{
  for(const streaming of [false,true]){
   const html=render(<SearchHighlightContext.Provider value="T"><Markdown text={'Ответ:\n\n$$'+formula+'$$'} streaming={streaming}/></SearchHighlightContext.Provider>);
   expect(html).toContain('<mfrac>');
   expect(html).toMatch(/style="[^"]*(height|top):/);
   expect(html).not.toContain('<mark');
  }
 });
 it('does not crash on incomplete math or enable links from untrusted TeX commands',()=>{
  expect(()=>render(<Markdown text={String.raw`$$\frac{a}{`} streaming/>)).not.toThrow();
  const html=render(<Markdown text={String.raw`$\href{javascript:alert(1)}{click}$`}/>);
  expect(html).not.toContain('href="javascript:');
 });
 it('keeps citations, search highlights and reveal wrappers out of generated math',()=>{
  const math:any={type:'element',tagName:'span',properties:{className:['katex']},children:[{type:'text',value:'T [1]',position:{start:{offset:0}}}]};
  const tree:any={type:'root',children:[math]},before=structuredClone(math);
  sourceCitations([{title:'Source',url:'https://example.com'}])()(tree);
  highlightSearch('T')()(tree);
  streamReveal({seenLength:0,births:new Map()},5,0)()(tree);
  expect(tree.children[0]).toEqual(before);
 });
 it('applies stream-block-enter to newly streamed subsequent blocks but leaves static history unaffected',()=>{
  const staticHtml=render(<Markdown text={'Первый абзац.\n\nВторой абзац.'} streaming={false}/>);
  expect(staticHtml).not.toContain('stream-block-enter');
  expect(staticHtml).toContain('class="stream-block"');
  const streamedHtml=render(<Markdown text={'Первый абзац.\n\nВторой абзац.'} streaming={true}/>);
  expect(streamedHtml).toContain('stream-block-enter');
 });
 it('supports code blocks, lists, quotes and tables with stable stream-block wrappers',()=>{
  const doc='## Заголовок\n\n```python\nprint(1)\n```\n\n- пункт 1\n- пункт 2\n\n> Цитата\n\n| A | B |\n|---|---|\n| 1 | 2 |';
  const html=render(<Markdown text={doc} streaming={true}/>);
  expect(html).toContain('stream-block');
  expect(html).toContain('<h2');
  expect(html).toContain('code-block');
  expect(html).toContain('<ul');
  expect(html).toContain('<blockquote');
  expect(html).toContain('table-scroll');
 });
});
