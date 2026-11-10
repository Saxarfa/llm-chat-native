import {expect,it} from 'vitest';
import {chatArtProgress} from './chatArtProgress';
import type {GeneratedImage} from './types';
const image={id:'test',prompt:'sky',status:'generating',width:512,height:512,image_count:0} satisfies GeneratedImage;
it('reports only finite sampling progress and preserves zero',()=>{
 expect(chatArtProgress({...image,progress:0})).toBe(0);
 expect(chatArtProgress({...image,progress:42.5})).toBe(42.5);
 expect(chatArtProgress({...image,progress:105})).toBe(100);
 for(const progress of [undefined,NaN,Infinity])expect(chatArtProgress({...image,progress})).toBeNull();
 for(const status of ['queued','preparing','done','error','cancelled'])expect(chatArtProgress({...image,status,progress:100})).toBeNull();
});
