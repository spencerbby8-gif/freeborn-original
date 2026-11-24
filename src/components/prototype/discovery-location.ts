"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { memberRequest } from "./data";

type Fix = {lat:number;lng:number;city:string|null};
// Exact coordinates are session-memory only, never browser storage or public profile data.
export function useDiscoveryLocation() {
  const [fix,setFix]=useState<Fix|null>(null);
  const generation=useRef(0);
  const invalidate=useCallback(()=>{generation.current++;},[]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [now,setNow]=useState<Date|null>(null);
  const request=useCallback((save=true)=>{
    if(!navigator.geolocation){setError("Location is not available on this device. You can still search Anywhere.");return;}
    const attempt=++generation.current;
    setBusy(true);setError(null);
    navigator.geolocation.getCurrentPosition(async position=>{
      if(attempt!==generation.current)return;
      const {latitude:lat,longitude:lng,accuracy:accuracyM}=position.coords;
      const next:Fix={lat,lng,city:null};setFix(next);
      try {
        const response=await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,{signal:AbortSignal.timeout(9000)});
        if(response.ok){const place=await response.json();const city=typeof place.city==='string'&&place.city.trim()?place.city:typeof place.locality==='string'?place.locality:null;if(attempt!==generation.current)return;next.city=city;setFix({...next});}
      }catch{/* Nearby filtering works without a city label; never invent a place. */}
      if(attempt!==generation.current)return;
      if(save)try{await memberRequest('/api/location',{lat,lng,accuracyM});}catch(e){setError(e instanceof Error?e.message:'Your position could not be saved.');}
      setBusy(false);
    },e=>{if(attempt!==generation.current)return;setFix(null);setBusy(false);setError(e.code===1?"Location access is off. You can still search Anywhere.":"We couldn’t find your position. Try again or search Anywhere.");},{enableHighAccuracy:true,maximumAge:60000,timeout:15000});
  },[]);
  useEffect(()=>{
    let live=true;let status:PermissionStatus|undefined;
    const changed=()=>{if(status?.state!=='granted'){generation.current++;setFix(null);setBusy(false);}else if(status?.state==='granted')request(false);};
    void navigator.permissions?.query({name:'geolocation'}).then(s=>{if(!live)return;status=s;s.addEventListener('change',changed);if(s.state==='granted')request(false);}).catch(()=>undefined);
    const tick=()=>setNow(new Date());queueMicrotask(tick);const timer=setInterval(tick,60000);document.addEventListener('visibilitychange',tick);
    return()=>{live=false;invalidate();status?.removeEventListener('change',changed);clearInterval(timer);document.removeEventListener('visibilitychange',tick);};
  },[request,invalidate]);
  return {fix,busy,error,now,request:()=>request(true)};
}
