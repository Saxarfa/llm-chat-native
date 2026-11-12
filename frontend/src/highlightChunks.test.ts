import {expect,it} from 'vitest';
import hljs from 'highlight.js/lib/common';
import {highlightChunks} from './highlightChunks';

const text=(html:string)=>html.replace(/<\/?span\b[^>]*>/g,'');
function styledCharacters(html:string){
 const result:string[]=[],styles:string[]=[];let cursor=0;
 const append=(end:number)=>{for(const char of html.slice(cursor,end))result.push(char+'|'+styles.join('>'))};
 for(const match of html.matchAll(/<\/?span\b[^>]*>/g)){
  append(match.index);cursor=match.index+match[0].length;
  if(match[0].startsWith('</'))styles.pop();else styles.push(/class="([^"]*)"/.exec(match[0])?.[1]||'');
 }
 append(html.length);return result;
}
function balanced(chunk:string){
 let depth=0;
 for(const match of chunk.matchAll(/<\/?span\b[^>]*>/g)){
  depth+=match[0].startsWith('</')?-1:1;expect(depth).toBeGreaterThanOrEqual(0);
 }
 expect(depth).toBe(0);
}
it('keeps multiline token styles balanced across chunk boundaries without adding text',()=>{
 const html='<span class="hljs-string">one\ntwo<span class="hljs-subst">three\nfour\nfive</span>six\nseven</span>';
 const chunks=highlightChunks(html,2);
 expect(chunks).toHaveLength(3);chunks.forEach(balanced);
 expect(chunks[1]).toMatch(/^<span class="hljs-string"><span class="hljs-subst">/);
 expect(text(chunks.join(''))).toBe(text(html));
});
it('retains escaped markup, spaces, blank lines and the final newline exactly',()=>{
 for(const code of ['','\n',' \n\n\tfoo\n','<script>alert("test")</script>\n\n']){
  const html=hljs.highlight(code,{language:'python'}).value,chunks=highlightChunks(html,1);
  expect(text(chunks.join(''))).toBe(text(html));chunks.forEach(balanced);
  expect(chunks.join('')).not.toContain('<script>');
 }
});
it('keeps completed chunks equal while newly generated lines are appended',()=>{
 const source=Array.from({length:128},(_,i)=>`print(${i})`).join('\n')+'\n';
 const before=highlightChunks(hljs.highlight(source,{language:'python'}).value);
 const after=highlightChunks(hljs.highlight(source+'print(130)',{language:'python'}).value);
 expect(before).toHaveLength(2);expect(after.slice(0,2)).toEqual(before);
 expect(after).toHaveLength(3);
});
it('preserves the token style of every character in Python and TypeScript across long strings and comments',()=>{
 const cases=[
  {language:'python',code:'value = """'+('text <>&\n'.repeat(140))+'"""\n# comment\nprint(value)'},
  {language:'typescript',code:'/* '+('comment <>&\n'.repeat(140))+'*/\nconst text = `'+('template <>& ${42}\n'.repeat(140))+'`;\n'},
 ];
 for(const {language,code} of cases){
  const html=hljs.highlight(code,{language}).value,chunks=highlightChunks(html);
  chunks.forEach(balanced);expect(styledCharacters(chunks.join(''))).toEqual(styledCharacters(html));
 }
});
