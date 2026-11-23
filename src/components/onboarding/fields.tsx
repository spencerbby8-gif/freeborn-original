"use client";

import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

type Chrome = {label:string;error?:string;hint?:string;optional?:boolean;counter?:{value:number;max:number}};
function Header({label,optional,counter,id}:Chrome & {id:string}) {return <div className="setup-field-head"><label htmlFor={id}>{label}</label><span>{counter ? `${counter.value}/${counter.max}` : optional ? "Optional" : ""}</span></div>;}
function Foot({id,error,hint}:{id:string;error?:string;hint?:string}) {return <p id={`${id}-hint`} className={error ? "setup-field-error" : "setup-field-hint"} role={error ? "alert" : undefined}>{error || hint}</p>;}
export function OnboardingTextInput({label,error,hint,optional,counter,id,name,className="",...props}:InputHTMLAttributes<HTMLInputElement> & Chrome) {
 const uid=useId();const key=id??name??uid;
 return <div className="setup-field"><Header {...{label,optional,counter}} id={key}/><input {...props} id={key} name={name} className={`setup-input ${className}`} aria-invalid={Boolean(error)} aria-describedby={`${key}-hint`}/><Foot id={key} error={error} hint={hint}/></div>;
}
export function OnboardingTextarea({label,error,hint,optional,counter,id,name,className="",...props}:TextareaHTMLAttributes<HTMLTextAreaElement> & Chrome) {
 const uid=useId();const key=id??name??uid;
 return <div className="setup-field"><Header {...{label,optional,counter}} id={key}/><textarea {...props} id={key} name={name} className={`setup-input ${className}`} aria-invalid={Boolean(error)} aria-describedby={`${key}-hint`}/><Foot id={key} error={error} hint={hint}/></div>;
}
type SelectProps={label?:string;hideLabel?:boolean;value:string;onChange:(value:string)=>void;options:Array<{value:string;label:string}>;placeholder?:string;error?:string;hint?:string;optional?:boolean};
/** Native keyboard/VoiceOver selection, styled dark to match the reference fields. */
export function SelectMenu({label,hideLabel,value,onChange,options,placeholder="Select…",error,hint,optional}:SelectProps){
 const id=useId();return <div className="setup-field">{label&&!hideLabel&&<Header id={id} label={label} optional={optional}/>}<div className="setup-select"><select id={id} aria-label={hideLabel||!label ? placeholder : undefined} value={value} onChange={e=>onChange(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint`} className="setup-input"><option value="" disabled>{placeholder}</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select><span aria-hidden="true">⌄</span></div>{(hint||error)&&<Foot id={id} error={error} hint={hint}/>}</div>;
}
export function ComboField({label,value,onChange,options,placeholder="Select or type…",optional,hint}:{label:string;value:string;onChange:(value:string)=>void;options:readonly string[];placeholder?:string;optional?:boolean;hint?:string}){
 const id=useId();return <div className="setup-field"><Header id={id} label={label} optional={optional}/><input id={id} list={`${id}-options`} className="setup-input" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} aria-describedby={`${id}-hint`}/><datalist id={`${id}-options`}>{options.map(o=><option key={o} value={o}/>)}</datalist><Foot id={id} hint={hint}/></div>;
}
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
export function DateOfBirthField({label="Date of birth",value,onChange,error,hint}:{label?:string;value:string;onChange:(value:string)=>void;error?:string;hint?:string}){
 // Emit partial dates as well: clearing a selection must not leave a stale valid date saved.
 const [year="",month="",day=""]=value.split("-");const id=useId();const now=new Date().getFullYear();
 return <fieldset className="setup-field setup-date" aria-describedby={`${id}-hint`}><legend className="setup-label">{label}</legend><div className="setup-date-row"><SelectMenu hideLabel value={month} onChange={m=>onChange(`${year}-${m}-${day}`)} options={MONTHS.map((m,i)=>({value:String(i+1).padStart(2,"0"),label:m}))} placeholder="Month"/><SelectMenu hideLabel value={day} onChange={d=>onChange(`${year}-${month}-${d}`)} options={Array.from({length:31},(_,i)=>({value:String(i+1).padStart(2,"0"),label:String(i+1)}))} placeholder="Day"/><SelectMenu hideLabel value={year} onChange={y=>onChange(`${y}-${month}-${day}`)} options={Array.from({length:83},(_,i)=>({value:String(now-18-i),label:String(now-18-i)}))} placeholder="Year"/></div><Foot id={id} error={error} hint={hint}/></fieldset>;
}
