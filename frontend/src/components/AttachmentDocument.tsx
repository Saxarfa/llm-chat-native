import {FileText,Clapperboard} from '../icons';
import type {Attachment} from '../types';
import {isMarkdownAttachment,isVideoAttachment} from '../chatAttachments';
import './AttachmentDocument.css';

export function AttachmentDocument({attachment}:{attachment:Attachment}){
 const video=isVideoAttachment(attachment),kind=video?'Видео MP4':isMarkdownAttachment(attachment)?'Markdown':'PDF',Icon=video?Clapperboard:FileText;
 return <a className="attachment-document" href={attachment.dataUrl} download={attachment.name} aria-label={`Скачать ${kind}: ${attachment.name}`} title={attachment.name}><Icon size={24}/><span><strong>{attachment.name}</strong><small>{kind}</small></span></a>;
}
