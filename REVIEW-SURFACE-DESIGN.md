# Reports and appeals review surface: design

Status: design plus the one increment that is safe to ship now.
Written 2026-10-23. Supersedes the deferral recorded in AUDIT.md 7.4.

## 1. The promise already published, and the hole under it

`/api/appeals` POST answers every member with:

> "Appeal received. A person reads every appeal. Check back here for the result."

`/safety` says an unresolved case "is read by the operator when a member writes in."

Both are keepable today, but only by hand and without a trace. Concretely, from
reading the code rather than assuming it:

- `appeals/route.ts:11-17` documents that **no code path writes
  `appeals.verdict` or sets `suspensions.active` to false**. A decision is a
  manual operator act.
- The member-facing GET returns `verdict: latest.verdict`, which is therefore
  always `null`. The member is told to "check back here for the result" at a
  place that can never show one.
- `appeal-experience.tsx:127-136` already renders a `cleared` verdict and a
  rejected one. The UI is built. Nothing can ever feed it.
- `suspensions` has `active`, `reason`, `created_at`. No `lifted_at`, no
  `lifted_by`. Lifting one is an UPDATE that leaves no record of who did it,
  when, or why.
- `reports` has `status`, `severity`, `triage_summary` (written by AI triage at
  `reports/route.ts:123`). No `reviewed_at`, no `reviewed_by`, no resolution.
  `status` can move but nothing records the human behind the move.

So the honest statement of the gap is not "suspensions cannot be lifted." It is:
**every moderation act in this product is currently unattributed and
unaudited, and the appeal verdict a member is promised has no writer.**

## 2. Why no web admin panel yet

Unjected's category-defining failures were both admin surfaces. In July 2022 an
admin dashboard was left in debug mode, unauthenticated, on the public internet,
exposing roughly 3,500 members' full names, dates of birth, marital status and
emails; it took days to fix. In February 2024 direct messages and locations
leaked. Neither breach needed a sophisticated attacker, because the
authentication was simply absent.

Freeborn has **no admin identity model at all**. There is no `is_admin` column,
no role table, no operator login distinct from a member login. Any panel built
today would have to invent one, and the fastest way to invent one is a shared
token in an env var. That is a weaker credential than the one already guarding
this database, guarding the same data, reachable from the public internet
instead of from Supabase.

Building that would repeat the exact failure the research was commissioned to
avoid. So the panel is not built. What is built instead removes the reason a
panel feels urgent.

## 3. Shipped now: attribution and audit, zero new attack surface

The operator already has a strongly authenticated, MFA-capable, IP-logged path
to this data: their own Supabase account. The right move for a solo operator is
to use the auth system that already exists rather than invent a weaker one
beside it.

Migration `moderation_review_accountability` adds:

- `public.moderation_actions`, an append-only audit log: `actor`, `action`,
  `subject_kind`, `subject_id`, `subject_email`, `reason`, `notes`,
  `created_at`. Indexed on `created_at` and `subject_id`. A table comment states
  that rows are never updated or deleted, because an audit log an operator can
  quietly edit is not an audit log.
- `reports.reviewed_at`, `reports.reviewed_by`, `reports.resolution`
- `suspensions.lifted_at`, `suspensions.lifted_by`, `suspensions.lift_note`
- `appeals.reviewed_by`

A second migration, `reports_origin`, adds `reports.origin` (`member` or
`identity_gate`) with a CHECK and a `(origin, status)` index. It came out of
running the queue query in section 4 against production and finding that both
open reports were machine-filed receipts, not complaints. See section 4 for why
the distinction matters and what it was backfilled on.

All nullable and additive, so nothing that runs today changes behaviour. RLS is
not enabled on `moderation_actions` for the same reason it is not on the other
operator tables: the app connects as `postgres` and no member-facing route reads
or writes it. That is a deliberate choice, not an oversight, and it is only safe
while no route touches the table. The moment an operator route exists, section 5
applies.

## 4. Operator runbook

Run in the Supabase SQL editor. Every statement is one transaction and writes
its own audit row, so an act and its record cannot be separated.

**Read the open queue, member accusations first, oldest first:**

```sql
select r.origin, r.id, r.created_at, r.reason, r.status, r.severity,
       r.triage_summary, r.details,
       sub.display_name as subject, sub.email as subject_email,
       rep.display_name as reporter
from public.reports r
left join public.user_profiles sub on sub.id = r.subject_id
left join public.user_profiles rep on rep.id = r.reporter_id
where r.status = 'open'
order by (r.origin = 'member') desc, r.created_at;
```

Read `origin` before anything else on the row, because it changes what the row
is. `member` is an accusation by one member about another and arrives triaged by
two engines, so `severity` and `triage_summary` are filled. `identity_gate` is a
receipt the photo gate filed against the member's own upload after a
high-confidence mismatch, it is never triaged so `severity` is null by design,
and the decision it records was already taken and already told to the member. A
null severity on a `member` row means triage failed and is worth investigating;
on an `identity_gate` row it means nothing is wrong.

This distinction exists because reading the live queue showed it was needed. Both
open reports at the time of writing were gate receipts from 2026-10-11, filed by
`api/profile/photos` with `reporter_id = subject_id`, `severity` null and
`triage_summary` null, and nothing on the row separated them from an untriaged
member complaint except the prose in `details`. Migration `reports_origin` added
the column, backfilled those two rows by matching the gate's fixed leading
phrase, and added `reports_origin_status_idx`.

**Close a report as unfounded:**

```sql
begin;
update public.reports
   set status = 'dismissed', resolution = 'unfounded',
       reviewed_at = now(), reviewed_by = 'operator'
 where id = '<report-id>';
insert into public.moderation_actions (actor, action, subject_kind, subject_id, reason, notes)
values ('operator', 'report_dismissed', 'report', '<report-id>', 'unfounded',
        '<what you actually observed>');
commit;
```

**Uphold a report:** set `status = 'upheld'`, `resolution` to the ground, and
audit `action = 'report_upheld'`. A report alone never suspends anyone; that is
published in `/safety` and in Terms, so upholding a report is a record, not an
automatic penalty.

**Clear an appeal and restore the member.** This is the act that finally feeds
the verdict UI at `appeal-experience.tsx:127`:

```sql
begin;
update public.suspensions
   set active = false, lifted_at = now(), lifted_by = 'operator',
       lift_note = '<why the suspension was wrong or is spent>'
 where lower(email) = lower('<member-email>') and active;
update public.appeals
   set status = 'decided', verdict = 'cleared', reviewed_at = now(),
       reviewed_by = 'operator'
 where lower(email) = lower('<member-email>')
   and verdict is null;
insert into public.moderation_actions (actor, action, subject_kind, subject_email, reason, notes)
values ('operator', 'appeal_cleared', 'appeal', '<member-email>', 'cleared',
        '<the reasoning a member could be told aloud>');
commit;
```

`appeal-experience.tsx` reads `verdict === 'cleared'` as success and any other
non-null verdict as the rejection text shown to the member. Write a verdict a
member can read, because that string is rendered to them verbatim.

**Reject an appeal:** same shape, `verdict` set to the reason, `status =
'decided'`, suspension left active, audit `action = 'appeal_rejected'`.

**Suspend by hand:** insert into `suspensions` with `reason`, then audit
`action = 'member_suspended'`. Note that `/api/security/check` already inserts
suspensions automatically for datacenter sign-in ranges
(`security/check/route.ts:44-51`) and does not write audit rows; that is the one
moderation act with a machine actor, and its attribution is the `reason` and
`ip` columns on the row itself.

**Read the audit log:**

```sql
select created_at, actor, action, subject_kind, subject_email, reason, notes
from public.moderation_actions
order by created_at desc
limit 100;
```

## 5. Preconditions for building the panel later

Do not build an operator route until all of these are true. Each one is a
response to a specific Unjected failure.

1. **A real operator identity.** A separate `operators` table keyed by email,
   populated out of band, with the check performed server-side on every request.
   Not a shared env token: a shared secret cannot attribute an act, which
   defeats the audit log added above, and rotating it means rotating it for
   everyone at once.
2. **Authentication that fails closed.** The route must reject when the operator
   lookup returns nothing, not fall through. `/api/profile/[id]` already models
   this: 401 for no session, and 404 rather than 403 for every refusal so the
   endpoint is not an oracle for which ids exist. An operator surface needs the
   same discipline, because it enumerates far more.
3. **Write access scoped to the act.** Reviewing a report must not require a
   connection that can read the whole database. The current app connects as
   `postgres`, which bypasses RLS entirely; that is acceptable for member routes
   that enforce privacy in application code and is not acceptable for a route
   whose entire purpose is bulk reading members.
4. **Rate limiting per operator and per subject.** Unjected's 2022 exposure was
   a bulk read. A review surface that can be scraped at speed turns one leaked
   credential into the whole member base.
5. **The audit log written by the route itself, in the same transaction.** If
   the act and its record can be separated, the record is optional, and an
   optional record is no record.
6. **An off switch that is not a deploy.** A way to revoke an operator
   immediately, without shipping code.
7. **No debug mode reachable in production.** The 2022 breach was a dashboard
   left in debug. Diagnostic output on an operator route must be gated on the
   same operator identity as the data.

Apple's condition for reinstating Unjected in 2021 was a working user-flag
moderation system. Freeborn's flag system exists and triages with two engines;
what was missing was a human decision with a record. Section 3 and 4 supply the
record and the procedure. Section 5 is what stands between that and a panel.

## 6. What this does not claim

The runbook makes the published promise keepable and accountable. It does not
make it self-service, it does not notify the member when a verdict lands (there
is no transactional email yet; that is the Gmail SMTP item), and it does not
reduce review latency. `/api/appeals` still computes a `dueAt` from a two-day
internal window that is explicitly not shown to members as a deadline, and that
remains correct: nothing enforces it.
