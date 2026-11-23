"use client";
import { useId } from "react";
/** Landing/member mark follows the auth flame silhouette, with a warm metallic
 * disc and a subtle ember fill. The exact auth reference logo stays untouched. */
export function BrandMark({size=38}:{size?:number}){
 const id=useId().replace(/:/g,'');
 return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" className="freeborn-brand-mark"><defs><linearGradient id={`disc-${id}`} x1="5" y1="5" x2="36" y2="36" gradientUnits="userSpaceOnUse"><stop stopColor="#fff0ca"/><stop offset=".46" stopColor="#f1cf99"/><stop offset="1" stopColor="#e7a58c"/></linearGradient><linearGradient id={`fire-${id}`} x1="20" y1="9" x2="20" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#a74d27"/><stop offset=".5" stopColor="#db7639"/><stop offset="1" stopColor="#f9dc93"/></linearGradient></defs><circle cx="20" cy="20" r="19" fill={`url(#disc-${id})`}/><g transform="translate(8 7)"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 5z" fill={`url(#fire-${id})`} stroke="#392316" strokeWidth="1.35" strokeLinecap="round"/><path d="M12.4 12.5c.6 3.2-3.4 3.7-2.6 6.1.5 1.4 2.3 1.8 3.6.7 1.9-1.6.9-4.6-1-6.8Z" fill="#fff1bc"/></g></svg>;
}
