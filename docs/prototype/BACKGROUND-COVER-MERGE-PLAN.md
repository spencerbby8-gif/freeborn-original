# Background cover correction and PR #90 completion plan

## Cover correction

The original couple artwork now covers the entire hero at desktop and mobile widths, behind the heading, description and signup control. It is not a separate image panel above the text. Responsive overlays maintain readability, and the artwork disclosure remains visible. The cover uses proportional `object-fit: cover` (some edge cropping is expected for a background). Responsive image source sizes account for a tall mobile cover, rather than requesting only a small viewport-width landscape image and stretching it across the background.

The landing acceptance test now requires the cover bounds to equal the hero bounds at all six widths, while the header, heading, description and CTA remain non-colliding. The prior cleanup, compact copy, static sample cards and no-JavaScript public rendering are retained.

## Fresh remote review

The public GitHub API still reports PR #90 at remote head `454ffef7008f516dd20ff7d37aec6bcbeeb9ba4e`:

| Item | Remote result |
| --- | --- |
| Git merge conflicts | None (`mergeable: true`) |
| Main CI `verify` | Completed successfully |
| CodeQL analysis job | Completed successfully |
| CodeQL alert gate | Failed: five high-severity findings |
| PR state | Open draft; not merged |
| Merge state | `unstable` |

The analysis job successfully running is not the same as its alert gate passing. Three reported paths are in the test harness (randomness, regex escaping, endpoint assertion); the other two concern file-derived media-preview text and sensitive filter values written to plaintext browser storage. These findings are not evidence that an account was compromised.

Local cleanup commit `cf60743` contains corrective changes for all five reported paths and extensive passing local checks. GitHub has not validated those changes because that commit is not on the remote branch. This cover correction is another local commit on the same branch. Neither change should be described as remotely deployed or CodeQL-clean until the appropriate remote checks run.

## Steps to a merge-ready PR

1. Restore secure Git authentication for this repository. Do not paste another token into chat or put it in a remote URL. Use a credential manager or an authenticated local checkout.
2. Push `feat/prototype-to-production` to the existing branch/PR, without force-pushing. This sends both the cleanup and cover correction. A patch series is also provided for applying the two commits in another checkout.
3. Let GitHub rerun all required checks against the **new** head. Confirm both `verify` and the separate CodeQL alert gate pass. Review any remaining/new findings; do not disable the gate to obtain a green result.
4. Review the changed landing page at phone/tablet/desktop widths and check the media/filter changes called out in the cleanup review. Additional sensitive search choices are now kept only in page memory; primary settings remain account-persisted.
5. Mark the PR ready for review (it is currently a draft), obtain any required approvals and verify branch-protection requirements. Those settings were not inspected with elevated permissions.
6. Merge only after approval and explicit authorization. No merge or production deployment is performed here.

## Launch readiness is a separate decision

A green PR is not proof of hosted RLS, actual OTP email delivery, physical-camera verification or all media delivery on real phones. Before a production rollout, confirm the hosted document-attachment migration and run signed-in/staging smoke tests for those paths. The existing migration prerequisite and local-fixture limits remain documented in `EXPERIENCE-REFINEMENT-REVIEW.md` and `LANDING-PRODUCTION-REVIEW.md`.

Current inability to push is an authentication issue in this workspace, not a Git merge conflict. The previously exposed credential has not been reused.
