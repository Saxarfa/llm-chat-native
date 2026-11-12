import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Markdown,preparedMarkdown} from './components/Messages';
import {webImageCopyText,webImagePath} from './webImages';
import type {WebImage} from './types';

vi.mock('./store',()=>({download:vi.fn(),forkBranch:vi.fn(),chooseVariant:vi.fn(),editMessage:vi.fn(),regenerate:vi.fn(),failure:vi.fn(),useChat:()=>({settings:{}})}));
const item:WebImage={id:'asset',chat_id:'chat',image_url:'https://example.org/real.png',source_url:'https://example.org/article',caption:'Diagram <safe>',width:140,height:70};

describe('registered web illustrations',()=>{
 it('keeps unregistered images as links and never loads arbitrary image URLs',()=>{
  const html=renderToStaticMarkup(<Markdown text={'Before\n\n![remote](https://example.org/untrusted.png)\n\nAfter'}/>);
  expect(html).not.toContain('<img');
  expect(html).toContain('href="https://example.org/untrusted.png"');
  expect(html.indexOf('Before')).toBeLessThan(html.indexOf('remote'));
  expect(html.indexOf('remote')).toBeLessThan(html.indexOf('After'));
 });
 it('renders only registered internal paths with reserved dimensions, caption and source',()=>{
  const text=`Before\n\n![Diagram](${webImagePath(item)})\n\nAfter`;
  const html=renderToStaticMarkup(<Markdown text={text} webImages={[item]}/>);
  expect(html).toContain('data-web-image-id="asset"');
  expect(html).toContain('--web-image-ratio:140/70');
  expect(html).toContain('Diagram &lt;safe&gt;');
  expect(html).toContain('href="https://example.org/article"');
  expect(html).not.toContain('src="https://');
  expect(html.indexOf('Before')).toBeLessThan(html.indexOf('data-web-image-id'));
  expect(html.indexOf('data-web-image-id')).toBeLessThan(html.indexOf('After'));
 });
 it('does not freeze illustration metadata inside the prepared Markdown cache',()=>{
  preparedMarkdown.clear();const key={},text=`![Diagram](${webImagePath(item)})`;
  expect(renderToStaticMarkup(<Markdown text={text} cacheKey={key}/>)).not.toContain('data-web-image-id');
  expect(renderToStaticMarkup(<Markdown text={text} webImages={[item]} cacheKey={key}/>)).toContain('data-web-image-id');
  expect(renderToStaticMarkup(<Markdown text={text} cacheKey={key}/>)).not.toContain('data-web-image-id');
  preparedMarkdown.clear();
 });
 it('copies portable original and source URLs instead of authenticated local paths',()=>{
  const copied=webImageCopyText(`Before\n\n![Diagram](${webImagePath(item)})\n\nAfter`,[item]);
  expect(copied).toContain(`![Diagram](<${item.image_url}>)`);
  expect(copied).toContain(`[Источник](<${item.source_url}>)`);
  expect(copied).not.toContain('/api/chats/');
  expect(webImageCopyText('Ordinary text')).toBe('Ordinary text');
 });
});
