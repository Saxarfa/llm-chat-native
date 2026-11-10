import {expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {AttachmentImages} from './components/AttachmentImages';
import {isPdfAttachment,isDocumentAttachment,isVideoAttachment,chatAttachmentAcceptFor,prepareChatAttachment} from './chatAttachments';
import {omni12Model} from './domain';
vi.mock('./components/ArtViewer',()=>({ArtViewer:()=>null}));

it('renders an MP4 as a named download and only accepts video for Omni',async()=>{
 const video={name:'source.mp4',dataUrl:'data:video/mp4;base64,AAAA'};
 expect(isVideoAttachment(video)).toBe(true);
 const markup=renderToStaticMarkup(<AttachmentImages attachments={[video]}/>);
 expect(markup).toContain('download="source.mp4"');expect(markup).toContain('Видео MP4');expect(markup).not.toContain('<img');
 expect(chatAttachmentAcceptFor(omni12Model)).toContain('video/mp4');
 expect(chatAttachmentAcceptFor('local-model')).not.toContain('video/mp4');
 await expect(prepareChatAttachment(new File(['bad'],'source.mp4'),'local-model')).rejects.toThrow('выберите Omni');
 await expect(prepareChatAttachment(new File(['bad'],'source.mp4'),omni12Model)).rejects.toThrow('Выберите другой файл');
});

it('renders a PDF as a named downloadable document rather than an image',()=>{
 const pdf={name:'report.pdf',dataUrl:'data:application/pdf;base64,JVBERi0='};
 const markup=renderToStaticMarkup(<AttachmentImages attachments={[pdf]}/>);
 expect(isPdfAttachment(pdf)).toBe(true);expect(markup).toContain('download="report.pdf"');expect(markup).toContain('report.pdf');expect(markup).not.toContain('<img');
});

it('explains model compatibility before reading a PDF and rejects false PDF headers',async()=>{
 const pdf=new File(['%PDF-1.7\n%%EOF'],'report.pdf',{type:'application/pdf'});
 await expect(prepareChatAttachment(pdf,'local-model')).rejects.toThrow('Для PDF выберите Gemini');
 await expect(prepareChatAttachment(new File(['bad'],'report.pdf'),'aistudio/gemini-4-argon')).rejects.toThrow('неверный заголовок');
});

it('renders Markdown as a named downloadable document',()=>{
 const md={name:'notes.md',dataUrl:'data:text/markdown;base64,IyBUZXN0'};
 const markup=renderToStaticMarkup(<AttachmentImages attachments={[md]}/>);
 expect(isDocumentAttachment(md)).toBe(true);expect(markup).toContain('download="notes.md"');expect(markup).toContain('Markdown');expect(markup).not.toContain('<img');
});

it('rejects invalid UTF-8 in Markdown before sending',async()=>{
 await expect(prepareChatAttachment(new File([new Uint8Array([255,254])],'notes.MD',{type:'application/octet-stream'}),'local-model')).rejects.toThrow('UTF-8');
});
