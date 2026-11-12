type Item={id?:string;role:string};

// Build history keys once instead of searching the full array for every row
// on each streamed update. System messages still count toward legacy IDs.
export function conversationMessageKeys(messages:readonly Item[]){
 let user=-1,earlierReply=false;
 return messages.map((item,index)=>{
  if(item.role==='user'){user=index;earlierReply=false;return item.id||index}
  if(item.role!=='assistant')return item.id||index;
  const key=user<0||earlierReply?`reply-extra-${item.id||index}`:`reply-${messages[user].id||`msg-${user}`}`;
  earlierReply=true;return key;
 });
}

// The first reply shares its user's key with the live placeholder. Deleting a
// later question can leave several replies together; those need distinct keys.
export function assistantMessageKey(messages:readonly Item[],index:number){
 const item=messages[index];
 let user=-1,earlierReply=false;
 for(let i=index-1;i>=0;i--){
  if(messages[i].role==='user'){user=i;break}
  if(messages[i].role==='assistant')earlierReply=true;
 }
 if(user<0||earlierReply)return `reply-extra-${item.id||index}`;
 return `reply-${messages[user].id||`msg-${user}`}`;
}
