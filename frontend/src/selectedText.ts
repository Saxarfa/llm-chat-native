export const selectionTextLimit=12000;
export type SelectionRect={left:number;right:number;top:number;bottom:number;width:number;height:number};
export type AnswerSelection={text:string;messageId:string;rect:SelectionRect};

function answerFor(node:Node|null){
 const element=node?.nodeType===Node.ELEMENT_NODE?node as Element:node?.parentElement;
 return element?.closest<HTMLElement>('.assistant-message .answer-content')||null;
}

// Both endpoints must belong to the same answer. Selection in the composer,
// reasoning, source lists or across messages must keep the browser's behavior.
export function selectedAnswer(selection:Selection|null,container:HTMLElement):AnswerSelection|null{
 if(document.activeElement?.matches('input,textarea,[contenteditable="true"]'))return null;
 if(!selection||selection.isCollapsed||selection.rangeCount!==1)return null;
 const answer=answerFor(selection.anchorNode);
 if(!answer||answer!==answerFor(selection.focusNode)||!container.contains(answer)||answer.closest('.live-message'))return null;
 const range=selection.getRangeAt(0);
 if(!answer.contains(range.commonAncestorContainer))return null;
 const text=selection.toString().trim();if(!text)return null;
 const bounds=container.getBoundingClientRect();
 const rects=Array.from(range.getClientRects()).filter(rect=>rect.width>0&&rect.height>0&&rect.bottom>Math.max(0,bounds.top)&&rect.top<Math.min(window.innerHeight,bounds.bottom));
 if(!rects.length)return null;
 const backwards=selection.anchorNode===range.endContainer&&selection.anchorOffset===range.endOffset;
 const rect=backwards?rects[0]:rects.at(-1)!;
 return {text,messageId:answer.closest<HTMLElement>('[data-message-id]')?.dataset.messageId||'',rect:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height}};
}

export function selectionToolbarPosition(rect:SelectionRect,size:{width:number;height:number},viewport:{left:number;top:number;width:number;height:number}){
 const gap=9,padding=12,leftEdge=viewport.left+padding,rightEdge=viewport.left+viewport.width-padding;
 const topEdge=viewport.top+padding,bottomEdge=viewport.top+viewport.height-padding;
 const left=Math.max(leftEdge,Math.min((rect.left+rect.right-size.width)/2,rightEdge-size.width));
 const below=rect.bottom+gap;
 const top=below+size.height<=bottomEdge?Math.max(topEdge,below):Math.max(topEdge,Math.min(rect.top-gap-size.height,bottomEdge-size.height));
 return {left,top};
}

export function selectionSourceLanguage(text:string):'ru'|'en'{
 return (text.match(/[а-яё]/gi)?.length||0)>(text.match(/[a-z]/gi)?.length||0)?'ru':'en';
}

export function selectedTextPrompt(text:string,question?:string){
 const instruction=question?.trim()||'Объясни этот фрагмент понятными словами. Учитывай контекст нашего разговора.';
 return `Фрагмент из ответа:\n\n${text.split('\n').map(line=>'> '+line).join('\n')}\n\n${instruction}`;
}
