"use client";
import { useEffect } from "react";
/** Focus remains in the topmost member dialog, then returns to its opener. */
export function useModalFocus(enabled:boolean){
 useEffect(()=>{if(!enabled)return;const opener=document.activeElement as HTMLElement|null;
 const top=()=>Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter(el=>el.getClientRects().length).at(-1);
 const controls=(el:HTMLElement)=>Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')).filter(el=>el.getClientRects().length);
 const timer=window.setTimeout(()=>{const dialog=top();if(dialog)controls(dialog)[0]?.focus({preventScroll:true});},0);
 const tab=(e:KeyboardEvent)=>{if(e.key!=='Tab')return;const dialog=top();if(!dialog)return;const items=controls(dialog);const first=items[0],last=items.at(-1);if(!first||!last)return;const current=document.activeElement;if(e.shiftKey&&(current===first||!dialog.contains(current))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(current===last||!dialog.contains(current))){e.preventDefault();first.focus();}};
 document.addEventListener('keydown',tab);return()=>{clearTimeout(timer);document.removeEventListener('keydown',tab);if(opener?.isConnected)opener.focus({preventScroll:true});};
 },[enabled]);
}
