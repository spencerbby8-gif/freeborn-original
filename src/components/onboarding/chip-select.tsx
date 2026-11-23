"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/icons";

type Props={label:string;options:readonly string[];value:string[];onChange?:(value:string[])=>void;error?:string;hint?:string;optional?:boolean;max?:number;collapseAfter?:number};
export function ChipSelect({label,options,value,onChange,error,hint,optional,max,collapseAfter}:Props){
 const [expanded,setExpanded]=useState(false);const collapsible=Boolean(collapseAfter&&options.length>collapseAfter);const visible=collapsible&&!expanded?options.filter((o,i)=>i<(collapseAfter??0)||value.includes(o)):options;
 return <fieldset className="setup-chip-group"><legend className="setup-label">{label}<span>{max?`${value.length}/${max}`:optional?"Optional":""}</span></legend><div className="setup-chips">{visible.map(o=>{const selected=value.includes(o);return <Button unstyled key={o} type="button" className={`setup-chip ${selected?"selected":""}`} aria-pressed={selected} disabled={!selected&&Boolean(max&&value.length>=max)} onClick={()=>onChange?.(selected?value.filter(v=>v!==o):[...value,o])}>{selected&&<CheckIcon size={13}/>} {o}</Button>;})}</div>{collapsible&&<Button unstyled type="button" className="setup-disclosure" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?"Show less":`Show all ${options.length}`}</Button>}{(hint||error)&&<p className={error?"setup-field-error":"setup-field-hint"} role={error?"alert":undefined}>{error||hint}</p>}</fieldset>;
}
