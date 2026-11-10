export function groupChats<T extends {updatedAt:number;pinned?:boolean;folder_id?:string|null}>(chats:T[],now=new Date(),folders:{id:string;name:string}[]=[]){
 const groups=new Map<string,{key:string;label:string;chats:T[]}>();
 const ordered=[...chats].sort((a,b)=>b.updatedAt-a.updatedAt),folderIds=new Set(folders.map(folder=>folder.id));
 const pinned=ordered.filter(chat=>chat.pinned);
 if(pinned.length)groups.set('pinned',{key:'pinned',label:'Закреплённые',chats:pinned});
 for(const folder of folders)groups.set('folder-'+folder.id,{key:'folder-'+folder.id,label:folder.name,chats:[]});
 const dayFormatter=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}),yearFormatter=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}),weekdayFormatter=new Intl.DateTimeFormat('ru-RU',{weekday:'long'});
 for(const chat of ordered){
  if(chat.pinned)continue;
  if(chat.folder_id!=null&&folderIds.has(chat.folder_id)){groups.get('folder-'+chat.folder_id)!.chats.push(chat);continue}
  const date=new Date(chat.updatedAt);
  const key=`date-${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
  if(!groups.has(key)){
   const day=(date.getFullYear()!==now.getFullYear()?yearFormatter:dayFormatter).format(date);
   const label=`${day}, ${weekdayFormatter.format(date)}`;
   groups.set(key,{key,label,chats:[]});
  }
  groups.get(key)!.chats.push(chat);
 }
 return [...groups.values()];
}
