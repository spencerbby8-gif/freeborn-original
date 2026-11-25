/** Never infer who hung up from which screen is rendering. */
export function callOutcome(endedBy:string|null|undefined,selfId:string,peerName:string,reason?:string|null){
 const verb=reason==='declined'?'declined':reason==='cancelled'?'cancelled':'ended';
 return endedBy?`${endedBy===selfId?'You':peerName} ${verb} the call`:'The call has ended';
}
