import { randomUUID } from 'node:crypto';

/** Safe operational diagnostics: never log SQL, parameters, email, tokens or GPS.
 * A response remains an error, never a fake empty collection or successful write.
 */
export function databaseErrorCode(error: unknown): string | null {
  let current=error;
  const seen=new Set<unknown>();
  for(let depth=0;depth<6 && current && typeof current==='object' && !seen.has(current);depth++) {
    seen.add(current);
    const value=current as {code?:unknown;cause?:unknown};
    if(typeof value.code==='string' && /^[0-9A-Z]{5}$/.test(value.code)) return value.code;
    current=value.cause;
  }
  return null;
}
export function withMemberApiErrors(handler:(request:Request)=>Promise<Response>,operation:'notifications-read'|'notifications-clear'|'discovery-read'|'discovery-choice'|'likes-read'|'location-save') {
  return async (request:Request):Promise<Response>=>{
    try{return await handler(request);}catch(error){
      const requestId=randomUUID();
      const code=databaseErrorCode(error);
      console.error(JSON.stringify({event:'member-api-failure',operation,requestId,databaseCode:code??'unknown'}));
      const unavailable=Boolean(code && (/^(08|53|57|58)/.test(code)||['40001','40P01','42703','42P01','42501'].includes(code))) || error instanceof Error && /temporarily unavailable/i.test(error.message);
      const messages={
        'notifications-read':'We couldn’t load your notifications. Please try again.',
        'notifications-clear':'Your notifications could not be cleared. Please try again.',
        'discovery-read':'We couldn’t load profiles right now. Please try again.',
        'discovery-choice':'Your choice could not be saved. Please try again.',
        'likes-read':'We couldn’t load your likes. Please try again.',
        'location-save':'Your location could not be saved. Please try again.',
      };
      return Response.json({error:messages[operation],requestId},{status:unavailable?503:500,headers:{'Cache-Control':'no-store',...(unavailable?{'Retry-After':'30'}:{})}});
    }
  };
}
