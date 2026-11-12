import {it,expect} from 'vitest';
import {sourceDetails,sourceHost,sourceHostLine,sourceIconUrl,sourceNote,sourceTitle} from './webSources';
const redirect='https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123';
it('takes the real host of Google redirect sources from the citation title',()=>{
 const source={url:redirect,title:'www.YouTube.com',provider:'google'};
 expect(sourceHost(source)).toBe('youtube.com');
 expect(sourceIconUrl(source)).toBe('https://youtube.com/favicon.ico');
 expect(sourceTitle(source)).toBe('www.YouTube.com');
 expect(sourceHostLine(source)).toBe('');
});
it('never shows the Google redirect host when the real site is unknown',()=>{
 const source={url:redirect,title:'Как устроен поиск',provider:'google'};
 expect(sourceHost(source)).toBe('');
 expect(sourceIconUrl(source)).toBe('');
 expect(sourceHostLine(source)).toBe('');
 expect(sourceTitle(source)).toBe('Как устроен поиск');
});
it('prefers a resolved URL and keeps ordinary sources unchanged',()=>{
 expect(sourceHost({url:redirect,title:'x',resolved_url:'https://www.anthropic.com/news'})).toBe('anthropic.com');
 const plain={url:'https://www.example.com/a?b=1',title:'Статья'};
 expect(sourceHost(plain)).toBe('example.com');
 expect(sourceIconUrl(plain)).toBe('https://www.example.com/favicon.ico');
 expect(sourceHostLine(plain)).toBe('example.com');
 expect(sourceIconUrl({url:'javascript:alert(1)'})).toBe('');
});
it('hides generic status labels but keeps informative ones',()=>{
 expect(sourceNote({url:redirect,provider:'google',read:false})).toBe('');
 expect(sourceNote({url:'https://example.com'})).toBe('');
 expect(sourceNote({url:'https://example.com',read:true,format:'pdf'})).toBe('Прочитано · PDF');
 expect(sourceNote({url:'https://example.com',kind:'knowledge',heading:'Раздел'})).toBe('База знаний · Раздел');
});
it('shows read status and publication date without claiming a snippet was read',()=>{
 expect(sourceDetails({url:'https://example.com',read:false,published_date:'2026-10-01'})).toContain('Поисковая выдержка');
 expect(sourceDetails({url:'https://example.com',read:true,format:'pdf'})).toBe('Прочитано · PDF');
 expect(sourceDetails({url:'https://example.com',read:true,published_date:'2026-10-01'})).toContain('2026');
});
it('does not invent dates for missing or malformed metadata',()=>{
 expect(sourceDetails({url:'https://example.com',read:false,published_date:'invalid'})).toBe('Поисковая выдержка');
 expect(sourceDetails({url:'https://example.com',read:false,read_error:'403'})).toContain('Страница недоступна');
});
it('does not label provider-managed Google URL evidence as a search snippet or a verified full read',()=>{
 expect(sourceDetails({url:'https://example.com',provider:'google',read:false})).toBe('Источник Google');
 expect(sourceDetails({url:'https://example.com',provider:'google',read:true})).toBe('Прочитано');
});
