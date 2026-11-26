# Hidden stories: local release notes

Status: implemented and tested on disposable local fixtures only. No approval to apply this migration to production is implied.

## Behavior

A member can hold a story avatar or use its keyboard-accessible options button to hide that author's stories **from their own story list**. The preference is stored server-side and applies across sessions/devices. It does not block the author, change who can see the viewer's stories, revoke direct access to otherwise eligible stories, or recall content already seen. The author is not notified. A hidden author can be unhidden in Story privacy, including if that relationship is no longer available; names are suppressed there for blocked or ended relationships. Records are included in the viewer's own data export and cascade if either account is deleted.

## Deployment gates

- The additive `20261122010000_hidden_story_authors.sql` must be reviewed and applied **before** deploying code that queries the new table. Until it exists and is accessible to the actual server database identity, the story feed and account export can fail; do not claim a deployment is safe based solely on local tests.
- Obtain explicit production approval, a verified restorable backup or separately accepted recovery risk, and an exact target/role preflight. Review migration history and schema to avoid reapplication. The earlier production runtime-role smoke failed for lack of privilege; this change does not resolve that failure. Verify the real server role's permissions and forced-RLS behavior through an appropriate authorized, non-destructive procedure before deployment; local `service_role` tests are not hosted proof.
- Test the migration, forced RLS and role grants on a representative disposable nonproduction project and perform controlled two-account hosted acceptance, including a real touch device, cross-device persistence, blocks, audience and expiry. No real-member contact is necessary.
- Rollback should first restore compatible application code while retaining the new table and data. Older application versions do not honor hidden preferences, so stories may reappear until compatible code returns. Do not drop the table or delete preference records as an automatic rollback.

Local tests use synthetic identities and a disposable PostgreSQL database. They do not prove Supabase Auth, hosted RLS, delivery, backup/restore or production compatibility.
