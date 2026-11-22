# Owner-requested second visual pass

## Delivery boundary

Work remains on `feat/prototype-to-production`, for the existing draft PR #90 only. No merge, production deployment, remote migration or environment edits. This pass is committed locally; pushing it requires repository write authentication again because the earlier token was deliberately not persisted. PR #90 must not be described as updated until the push is confirmed.

## References and actual changes

Both owner attachments were reviewed: the large Discover/member-profile illustration and the 15-screen Chromium reference grid. This is a closer implementation of their composition, not a pixel-identical claim: member content and portraits come from authorized API results, browser fonts and viewports differ, and optional missing details are not fabricated.

- Discover: darker ink-blue surfaces, serif heading, layered deck edge, portrait crop/scrim, warm chips and gradients, and action controls enclosed by the card border. Chips no longer pretend that fixed sample preferences are active.
- Member profiles: removed the legacy full-profile/safety destination. Discover, likes, matches, chat, self preview and editor preview use the new MemberDetail. Main navigation hides while it is open. It shows supplied public bio, goals, lifestyle, drinking, height, language, work, education, faith, relationship/family details, smoking, gender, city/region, distance, member-since, mixer city, public health choice, interests, values, shared interests, prompts, additional photos and boundaries when returned. It does not invent zodiac, compatibility scores or activity.
- Native member sheets: report (including AI-generated media), block confirmation, end conversation with optional reason, and delete-conversation confirmation. Existing destructive flags, authorization and irreversible/read-only semantics are preserved.
- New matching Account: actual private email, membership date, active sign-in count, email confirmation, current-password-checked password change, authenticated JSON export, deactivate confirmation, typed permanent-deletion confirmation, logout and error states. A 202 cleanup remains pending, including the deletion-status fragment token. Deactivation does not promise that the separate discoverable switch reverses `profileStatus=hidden`; return guidance points to support.
- New matching support queue form, audience privacy controls, blocked-member manager, outgoing-like activity and device preferences replace the old route wrappers. Device preferences are wired to units, notification sound preferences, member-frame animation suppression and optional supported-device vibration.
- New discovery-filter overlay is reachable from Notifications and the other filter triggers. Every HomeFilters field remains available, including advanced optional-detail controls, photo requirement, vaccination preference, verified/activity/new/mixer flags. Real facet values and selected values remain selectable. Standing shared settings seed the form when no device filters exist. Shared saves must succeed before a success/close; advanced filters remain device-local, as disclosed.
- Full photo/profile editor keeps upload/reorder/delete/camera/identity checks, all fields and prompt editing; editor chrome matches the new presentation. Save stays in the editor; back/cancel returns to the new self profile. Preview is the new MemberDetail. Network/save errors are shown.
- Shared flame SVG is used on auth, member rail, landing navigation and footer. The existing exact verification SVG is unchanged: `#3b9df2` and `#fff`.
- Landing Hero uses only `public/images/couples-hero.jpg` from PR #89 head `a002ed103930d921f6eff79f32bb4862cad2c0a5`. No PR #89 merge or code transplant. Asset SHA256: see the evidence manifest generated at delivery. Artwork is identified as illustrative/generated, not actual members. Mobile composition keeps both people visible.
- Verification service flow is preserved inside matching modal chrome. The old `/discover` HomeDeck entry redirects to `/app`. Premium no longer shows invented prices/savings or promises unimplemented subscription entitlements; purchasing remains honestly unavailable.

## Verification performed

- Clean production Next.js build using Node 24.22.2 and `fixture.supabase.co` public test configuration: pass. CSP was not weakened.
- TypeScript: pass; ESLint: no errors or warnings.
- Existing trust harness: 619/619; engine request tests: 10; database TLS: 10; TURN: 30.
- Local substituted-adapter API contract assertions: 23/23.
- Browser fixture checks: 21/21, 46 screenshots at 393×852 and 1440×1000, no page JavaScript errors. Includes card/action containment, native profile details/no fallback, report and confirmed block payloads, new filter save, account forms/failures, support contract, editor navigation, verification chrome, and typed deletion/pending-cleanup handling. Screenshot/profile content is explicitly test-only, not production members.
- Static import reachability: 20 member/Discover page entries, 65 source modules; no reachable old ProfileView, SettingsView, FilterPanel, LikesView or HomeDeck. This is not a claim that every possible runtime button was manually exercised.
- Migration manifest, environment isolation, secret scan: pass. No historical SQL edited; no new migration in this pass.

Evidence: `evidence/refinement/results.json`, `route-audit.json`, and PNG files. The standalone HTML review embeds selected actual captures and both supplied references for visual review.

## Still not established

Hosted Preview Supabase remains inaccessible. Fixture browser/API tests do not prove hosted persistence, RLS, real email delivery, real account deletion/export, moderation processing, physical camera/phone/call behavior or payment readiness. No production data or database was substituted. Existing unreleased billing and incomplete production-acceptance items remain release blockers. The two reference images are design references, not proof that any live member supplied those example facts.
