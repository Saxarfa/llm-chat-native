import {useRef,useState} from 'react';
import {ArtViewer} from './ArtViewer';
import {AttachmentDocument} from './AttachmentDocument';
import {isFileAttachment} from '../chatAttachments';
import type {Attachment} from '../types';
import './AttachmentImages.css';

function AttachmentImage({attachment}:{attachment:Attachment}){
 const source=useRef<HTMLButtonElement>(null),image=useRef<HTMLImageElement>(null),[open,setOpen]=useState(false),[size,setSize]=useState({width:1,height:1});
 const openImage=()=>{
  const current=image.current;
  if(!current?.naturalWidth||!current.naturalHeight)return;
  setSize({width:current.naturalWidth,height:current.naturalHeight});setOpen(true);
 };
 const origin=()=>{const rect=image.current?.getBoundingClientRect();return rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null};
 return <><button ref={source} type="button" className="message-image-preview" aria-label={`Открыть изображение: ${attachment.name}`} onClick={openImage}><img ref={image} src={attachment.dataUrl} alt={attachment.name} draggable={false}/></button>
  <ArtViewer open={open} onOpenChange={setOpen} frame={{job:{id:attachment.name,prompt:attachment.name,...size},url:attachment.dataUrl}} previous={null} getSourceRect={origin} restoreFocus={()=>source.current?.focus({preventScroll:true})} title="Просмотр прикреплённого изображения" closeLabel="Закрыть изображение"/>
 </>;
}

export function AttachmentImages({attachments}:{attachments:Attachment[]}){
 return <div className="message-images">{attachments.map((attachment,index)=>isFileAttachment(attachment)?<AttachmentDocument key={index} attachment={attachment}/>:<AttachmentImage key={index} attachment={attachment}/>)}</div>;
}
