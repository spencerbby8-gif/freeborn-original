"use client";
import type { ReactNode } from "react";
import { PhotoImage } from "@/components/ui/photo-image";
import { VerifyBadge } from "@/components/verify-badge";
import { PrototypeIcon } from "./frame";

/** Measured from the supplied prototype; identity/presence always come from the API. */
export function ChatHeader({name,photo,verified,active,subtitle,onBack,onProfile,children}:{name:string;photo?:string;verified?:boolean;active?:boolean;subtitle?:string;onBack:()=>void;onProfile:()=>void;children?:ReactNode}){
 return <header className="reference-chat-head"><button type="button" className="bare-icon" aria-label="Back to conversations" onClick={onBack}><PrototypeIcon name="back"/></button><button type="button" className="reference-chat-person" aria-label={`View ${name}'s profile`} onClick={onProfile}>{photo?<PhotoImage src={photo} alt="" className="chat-avatar-img" compact priority/>:<span className="chat-avatar-img fb-placeholder">{name.charAt(0)}</span>}<span className="chat-id"><b>{name}{verified&&<span className="verified"><VerifyBadge size={15}/></span>}</b><span className={`chat-status ${active?'is-active':''}`}>{active&&<i className="pulse-dot"/>}{subtitle??(active?'Active now':'Freeborn member')}</span></span></button>{children}</header>;
}
export function ChatSendIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5"/></svg>;}
