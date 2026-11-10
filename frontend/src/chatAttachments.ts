import type {Attachment} from './types';
import {isOmniModel} from './domain';

export const chatAttachmentAccept='image/png,image/jpeg,image/webp,application/pdf,.pdf,text/markdown,text/x-markdown,.md,.markdown';
export const chatAttachmentAcceptFor=(model:string)=>chatAttachmentAccept+(isOmniModel(model)?',video/mp4,.mp4':'');
export const isVideoAttachment=(item:Attachment)=>item.dataUrl.startsWith('data:video/mp4;base64,');
export const isPdfAttachment=(item:Attachment)=>item.dataUrl.startsWith('data:application/pdf;base64,');
export const isMarkdownAttachment=(item:Attachment)=>item.dataUrl.startsWith('data:text/markdown;base64,');
export const isDocumentAttachment=(item:Attachment)=>isPdfAttachment(item)||isMarkdownAttachment(item);
export const isFileAttachment=(item:Attachment)=>isDocumentAttachment(item)||isVideoAttachment(item);
export const supportsPdf=(model:string)=>['aistudio/gemini-4-carbon','aistudio/gemini-4-argon','aistudio/gemini-3.8-flash','aistudio/gemini-3.5-flash-lite'].includes(model);

async function fileDataUrl(file:File,mime:string):Promise<string>{
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onerror=()=>reject(new Error('Не удалось прочитать файл.'));
  reader.onload=()=>resolve(`data:${mime};base64,`+String(reader.result).split(',')[1]);reader.readAsDataURL(file);
 });
}

export async function prepareChatAttachment(file:File,model:string):Promise<Attachment>{
 if(file.type==='video/mp4'||/\.mp4$/i.test(file.name)){
  if(!isOmniModel(model))throw new Error('Для видео MP4 выберите Omni.');
  if(file.size>24*1024**2)throw new Error('Выберите видео MP4 размером до 24 МБ.');
  if(new TextDecoder().decode(await file.slice(4,8).arrayBuffer())!=='ftyp')throw new Error('Не удалось прочитать MP4. Выберите другой файл.');
  return {name:file.name,dataUrl:await fileDataUrl(file,'video/mp4')};
 }
 if(/\.(md|markdown)$/i.test(file.name)||['text/markdown','text/x-markdown'].includes(file.type)){
  try{new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer())}catch{throw new Error('Не удалось прочитать Markdown: сохраните файл в UTF-8.')}
  return {name:file.name,dataUrl:await fileDataUrl(file,'text/markdown')};
 }
 if(file.type==='application/pdf'||(!file.type&&/\.pdf$/i.test(file.name))){
  if(!supportsPdf(model))throw new Error('Для PDF выберите Gemini через AI Studio: Carbon, Argon, Flash или Flash-Lite.');
  if(await file.slice(0,5).text()!=='%PDF-')throw new Error('Не удалось прочитать PDF: неверный заголовок файла.');
  const dataUrl=await fileDataUrl(file,'application/pdf');
  return {name:file.name,dataUrl};
 }
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Выберите Markdown (.md), PDF, PNG, JPEG или WebP.');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;await image.decode();const scale=Math.min(1,1600/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
  canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);const context=canvas.getContext('2d')!;
  context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  return {name:file.name,dataUrl:canvas.toDataURL('image/jpeg',.86)};
 }finally{URL.revokeObjectURL(url)}
}
