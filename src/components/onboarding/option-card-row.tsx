"use client";

import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/icons";
import { PrototypeIcon } from "@/components/prototype/frame";

type Option = { value: string; label: string; caption?: string };
type OptionCardRowProps = {options: Option[];value: string[];onChange: (next: string[]) => void;max?: number};
export function OptionCardRow({ options, value, onChange, max }: OptionCardRowProps) {
  const toggle = (key: string) => {if(value.includes(key))onChange(value.filter(v=>v!==key));else if(!max||value.length<max)onChange([...value,key]);};
  return <div className="option-list">{options.map(o=>{const active=value.includes(o.value);return <Button unstyled className={`option-card ${active?'selected':''}`} key={o.value} onClick={()=>toggle(o.value)} disabled={!active&&Boolean(max&&value.length>=max)} aria-pressed={active}><span className="option-ic"><PrototypeIcon name={o.value==='friendship'?'discover':o.value==='still_exploring'?'help':'heart'}/></span><span className="option-text"><b>{o.label}</b>{o.caption&&<small>{o.caption}</small>}</span><CheckIcon className="option-check" size={24}/></Button>;})}</div>;
}
