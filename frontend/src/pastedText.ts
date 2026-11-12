export function isLargePaste(text:string){
 return text.trim().length>=1200||(text.trim().length>=300&&text.split(/\r?\n/).length>=12);
}

// Keep pasted content intact, including whitespace and code indentation.
export function composePastedMessage(message:string,pastes:string[]){
 return [message,...pastes].filter(text=>text.trim().length>0).join('\n\n');
}
