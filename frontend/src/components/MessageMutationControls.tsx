import type {ReactNode} from 'react';
import {getState,useChatSelection} from '../store';

export function chatMutationLocked(){const state=getState();return !!state.lives[state.active]}

// Native disabled propagation changes one fieldset, without rebuilding every
// historical message and Motion node when generation starts or finishes.
export function MessageMutationControls({children}:{children:ReactNode}){
 const locked=useChatSelection(state=>!!state.lives[state.active]);
 return <fieldset className="message-mutation-controls" disabled={locked}>{children}</fieldset>;
}
