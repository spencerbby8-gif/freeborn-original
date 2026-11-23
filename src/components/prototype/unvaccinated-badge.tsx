"use client";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

const SEEN='freeborn.badge-explained.v1';
let explained=false;
export function UnvaccinatedBadge(){
  const [open,setOpen]=useState(false);
  useEffect(()=>{
    let seen=explained;
    try{seen=seen||sessionStorage.getItem(SEEN)==='1';}catch{/* memory fallback */}
    if(seen)return;
    explained=true;try{sessionStorage.setItem(SEEN,'1');}catch{/* memory fallback */}
    queueMicrotask(()=>setOpen(true));const timer=setTimeout(()=>setOpen(false),12000);return()=>clearTimeout(timer);
  },[]);
  return <div className="unvaccinated-marker"><Button unstyled type="button" className="unvaccinated-badge" aria-label="Unvaccinated badge: self-reported status, identity verified" aria-expanded={open} onClick={()=>setOpen(!open)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 20 7v10l-8 4.5L4 17V7z"/><path d="M8 15c0-5 3-7 8-7 0 5-2 8-6 8m-2 1 6-6"/></svg><span>Unvaccinated</span></Button>{open&&<div className="unvaccinated-tip" role="status"><b>What this means</b><p>This member chose “Unvaccinated” and completed identity verification. Vaccination status is self-reported, not medically verified.</p><Button unstyled type="button" aria-label="Dismiss badge explanation" onClick={()=>setOpen(false)}>Got it</Button></div>}</div>;
}
