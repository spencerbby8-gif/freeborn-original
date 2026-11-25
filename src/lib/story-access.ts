import { sql } from "drizzle-orm";
/** s=member_stories, p=story_preferences. Always evaluated on the server, including image reads. */
export function storyAudienceSql(viewerId:string){return sql`(
 s.author_id = ${viewerId}::uuid or (
 exists(select 1 from public.matches m where m.status='active' and
 ((m.user_a=s.author_id and m.user_b=${viewerId}::uuid) or (m.user_b=s.author_id and m.user_a=${viewerId}::uuid)))
 and not exists(select 1 from public.blocked_users b where
 (b.blocker_id=s.author_id and b.blocked_id=${viewerId}::uuid) or (b.blocked_id=s.author_id and b.blocker_id=${viewerId}::uuid))
 and (coalesce(p.audience,'all')='all'
 or (p.audience='exclude' and not (p.selected_ids ? ${viewerId}))
 or (p.audience='only' and p.selected_ids ? ${viewerId}))
 ))`;}
export const STORY_INPUT_LIMIT=4*1024*1024;
export const STORY_OUTPUT_LIMIT=1024*1024;
