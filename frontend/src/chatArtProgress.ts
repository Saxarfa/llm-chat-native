import type {GeneratedImage} from './types';

// Only ComfyUI's reported sampling progress is a percentage.
export function chatArtProgress(image:GeneratedImage){
 return image.status==='generating'&&image.progress!=null&&Number.isFinite(image.progress)
  ?Math.max(0,Math.min(100,image.progress)):null;
}
