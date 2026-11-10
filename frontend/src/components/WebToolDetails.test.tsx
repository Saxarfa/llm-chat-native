import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {WebToolDetails} from './WebToolDetails';
import type {ToolEvent} from '../types';
const base:ToolEvent={id:'search',name:'web_search',status:'completed'};

it('shows actual snippets as plain text and rejects executable links',()=>{
 const html=renderToStaticMarkup(<WebToolDetails event={{...base,web_result:{kind:'search',results:[{title:'Official page',url:'https://example.org/a',snippet:'<script>alert(1)</script>',citation:1},{title:'Bad URL',url:'javascript:alert(1)',snippet:'Other snippet'}]}}}/>);
 expect(html).toContain('Official page');expect(html).toContain('&lt;script&gt;');
 expect(html).not.toContain('<script>');expect(html).not.toContain('href="javascript:');
 expect(html).toContain('Other snippet');
});

it('distinguishes old events from empty search results',()=>{
 const old=renderToStaticMarkup(<WebToolDetails event={base} sources={[{title:'Saved source',url:'https://example.org/a'}]}/>);
 expect(old).toContain('Подробности этого шага не сохранялись');expect(old).toContain('Saved source');
 expect(old).not.toContain('Поиск не вернул результатов');
 const empty=renderToStaticMarkup(<WebToolDetails event={{...base,web_result:{kind:'search',results:[]}}}/>);
 expect(empty).toContain('Поиск не вернул результатов');
});

it('shows the page focus and model excerpt with cache and redirect information',()=>{
 const html=renderToStaticMarkup(<WebToolDetails event={{id:'read',name:'fetch_url',status:'completed',url:'https://example.org/old',focus:'release date',web_result:{kind:'page',title:'Announcement',resolved_url:'https://example.org/new',content:'Exact excerpt sent to model.',excerpted:true,cached:true}}}/>);
 expect(html).toContain('release date');expect(html).toContain('Exact excerpt sent to model.');
 expect(html).toContain('Переданный модели текст');expect(html).toContain('из кеша');expect(html).toContain('https://example.org/new');
});

it('keeps large excerpts collapsed initially',()=>{
 const text='Long page evidence. '.repeat(300);
 const html=renderToStaticMarkup(<WebToolDetails event={{id:'read',name:'fetch_url',status:'completed',web_result:{kind:'page',content:text}}}/>);
 expect(html).toContain('Показать весь текст');expect(html).toContain('aria-expanded="false"');expect(html).not.toContain(text);
});
