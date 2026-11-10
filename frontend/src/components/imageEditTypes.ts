import type {StudioJob} from './studioTypes';
export type ImageEditMessage={id:string;parent_id:string|null;role:'user'|'model';text:string;job_id?:string;created:number;job?:StudioJob};
export type ImageEditView={session:{id:string;root_job_id:string;model:string;created:number};root_job:StudioJob;messages:ImageEditMessage[];active_job:StudioJob|null};
export type ImageEditVersion={message_id:string|null;job:StudioJob;label:string};
export const imageEditPending=(job?:StudioJob|null)=>!!job&&['queued','preparing','generating'].includes(job.status);
export function imageEditPath(messages:ImageEditMessage[],head:string|null){
 const byId=new Map(messages.map(message=>[message.id,message])),seen=new Set<string>(),path:ImageEditMessage[]=[];
 while(head&&!seen.has(head)){seen.add(head);const message=byId.get(head);if(!message)break;path.push(message);head=message.parent_id}
 return path.reverse();
}
export function imageEditVersions(view:ImageEditView):ImageEditVersion[]{
 const original=view.messages.find(message=>message.role==='model'&&message.job?.id===view.root_job.id&&message.job.status==='done');
 return [{message_id:original?.id??null,job:view.root_job,label:'Исходник'},...view.messages.filter(message=>message.role==='model'&&message.job?.id!==view.root_job.id&&message.job?.status==='done'&&!!message.job.images?.length).map((message,index)=>({message_id:message.id,job:message.job!,label:`Версия ${index+1}`}))];
}
export function latestImageEditParent(view:ImageEditView){return [...view.messages].reverse().find(message=>message.role==='model'&&message.job?.status==='done')?.id??null}
