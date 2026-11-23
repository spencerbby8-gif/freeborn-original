/** Download-only document attachments. Never accept executable/HTML/SVG content. */
export const CHAT_FILE_ACCEPT = ".pdf,.txt,.csv,.docx,.xlsx,.pptx";
export const CHAT_FILE_MAX = 8 * 1024 * 1024;
export const CHAT_FILE_TYPES: Record<string,string> = {
 pdf:"application/pdf",txt:"text/plain",csv:"text/csv",
 docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
 xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
 pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
export function chatFileMime(name:string):string|null {return CHAT_FILE_TYPES[name.split('.').pop()?.toLowerCase()??""]??null;}
export function validChatFileBytes(mime:string, bytes:Uint8Array):boolean {
 if (!bytes.length || bytes.length>CHAT_FILE_MAX) return false;
 if(mime==="application/pdf")return new TextDecoder().decode(bytes.slice(0,5))==="%PDF-";
 if(Object.values(CHAT_FILE_TYPES).filter(v=>v.includes('openxmlformats')).includes(mime))return bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===3&&bytes[3]===4;
 if(mime==="text/plain"||mime==="text/csv") {try {const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);return !text.includes('\0');}catch{return false;}}
 return false;
}
export function safeChatFilename(value:string):string {return value.replace(/[\u0000-\u001f\u007f/\\|\[\]]/g,'_').slice(0,100)||"Attachment";}
