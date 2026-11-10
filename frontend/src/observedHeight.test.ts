import {expect,it} from 'vitest';
import {observedHeight} from './observedHeight';

it('keeps the full padded height and supports older ResizeObserver implementations',()=>{
 const entry={contentRect:{height:100},borderBoxSize:[{blockSize:132}]} as unknown as ResizeObserverEntry;
 expect(observedHeight(entry)).toBe(132);
 expect(observedHeight({...entry,borderBoxSize:{blockSize:132}} as unknown as ResizeObserverEntry)).toBe(132);
 expect(observedHeight({...entry,borderBoxSize:[]})).toBe(100);
});
