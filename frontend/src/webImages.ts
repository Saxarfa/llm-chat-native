import type {WebImage} from './types';

export const webImagePath=(item:WebImage)=>`/api/chats/${encodeURIComponent(item.chat_id)}/web-images/${encodeURIComponent(item.id)}`;

// Clipboard text remains usable outside this authenticated application.
export function webImageCopyText(text:string,images:readonly WebImage[]=[]){
 for(const item of images){
  const path=webImagePath(item);
  text=text.replaceAll(`](${path})`,`](<${item.image_url}>)\n\n[Источник](<${item.source_url}>)`);
 }
 return text;
}
