/** Local suggestions use only authorized public profile facts. No AI/service or
 * compatibility claim: every suggestion is editable and never sent on open. */
export function conversationOpener(profile:{name:string;interests?:string[];prompts?:{prompt?:string;answer?:string}[]}):string{
 const first=profile.name.trim().split(/\s+/)[0]||'there';
 const interest=profile.interests?.find(v=>v.trim());
 if(interest)return `Hey ${first}, ${interest.toLowerCase()} caught my eye on your profile. What do you love most about it?`;
 if(profile.prompts?.some(p=>p.answer?.trim()))return `Hey ${first}, I enjoyed reading your profile. What’s the story behind your first prompt answer?`;
 return `Hey ${first}, I’d love to get to know you. What’s something you’ve been genuinely excited about lately?`;
}
export function draftChatHref(profileId:string){return `/app/chat?to=${encodeURIComponent(profileId)}`;}
