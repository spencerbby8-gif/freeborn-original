# Git review handover

- Repository: `spencerbby8-gif/freeborn-original`.
- Review branch: `feat/member-stories-calls-chat`.
- Base: `8e7dea489d996e66b54598fd6561efc04f678c7c` (main at clone/review).
- Owner authorizes branch push, not merge, production migration or deployment.
- A credential-free `git push --dry-run origin HEAD:refs/heads/feat/member-stories-calls-chat` was refused because HTTPS authentication is unavailable in this session. No credential was printed, persisted in remotes/project files, or used from an unrelated source. Push/PR status must be verified separately; a compare URL is not a PR.
- Remote heads were checked read-only: main matched the base and no branch of this name was listed. Local code and docs are committed as a review checkpoint; obtain the exact commit with `git log -1`. No upstream tracking assertion is made.
- Other pending clone `/home/user/freeborn-original` was compared, not bulk-copied: 449 relevant pending paths, 401 identical, 48 divergent, 0 missing paths. Divergent older Discovery/UI were not imported. Detailed hashes are in the local evidence directory. The older clone remains untouched.
- Common Ground → Real Plans proposal is copied byte-for-byte to `docs/product/COMMON-GROUND-REAL-PLANS-EXACT.md`; it is future direction, not a completed new engine. Its execution plan is beside it.

After authentication is safely restored, fetch/review remote branch state, run the checks if the base changed, then push this feature branch without force. If a remote branch diverged, stop and reconcile. A protected push may create a preview through the repository's hosting integration; it does not authorize production promotion. Do not merge or mutate production.

`git bundle` can transfer this local review branch without credentials. A bundle is not proof that GitHub received the commit.
