import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import * as icons from './index';

it('keeps decorative icons silent and labelled standalone icons available to assistive technology',()=>{
 for(const Icon of Object.values(icons)){
  const decorative=renderToStaticMarkup(createElement(Icon));
  expect(decorative).toContain('aria-hidden="true"');
  expect(decorative).toContain('focusable="false"');
  const meaningful=renderToStaticMarkup(createElement(Icon,{'aria-label':'Состояние'}));
  expect(meaningful).toContain('role="img"');
  expect(meaningful).not.toContain('aria-hidden="true"');
  const hidden=renderToStaticMarkup(createElement(Icon,{'aria-label':'Состояние','aria-hidden':true}));
  expect(hidden).toContain('aria-hidden="true"');
 }
});

it('supports externally labelled icons, explicit roles and fill state without changing the viewbox',()=>{
 for(const Icon of [icons.Pin,icons.Star,icons.Loader2]){
  const html=renderToStaticMarkup(createElement(Icon,{'aria-labelledby':'status-text'}));
  expect(html).toContain('role="img"');
  expect(html).not.toContain('aria-hidden="true"');
 }
 const normal=renderToStaticMarkup(createElement(icons.Star));
 const selected=renderToStaticMarkup(<icons.Star fill="currentColor" data-pinned="true"/>);
 expect(selected).not.toBe(normal);
 expect(selected).toContain('viewBox="0 0 56 56"');
 expect(selected).toContain('data-pinned="true"');
});
