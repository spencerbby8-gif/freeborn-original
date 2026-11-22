# Shared loading, email OTP, seven-step onboarding and chat media

Continuation on `feat/prototype-to-production`, existing draft PR #90. Local implementation only: no merge, push, hosted migration, auth-config mutation or production deployment in this pass. Previous chat/verification review remains historical; this document supersedes its test counts and its statement that no migration was added.

## Implemented

- Shared ember/flame/spark loader replaces generic loading text/spinners in auth, app shell, chat, member screens and verification. No artificial minimum waiting time. Accessible status label and static reduced-motion rendering. Original auth logo and blue/white verification badge preserved.
- Native matching email confirmation screen uses the existing Supabase signup, `verifyOtp` and resend integrations. Numeric/paste normalization and client validation; six-digit configured OTP supported. Timestamp-based 60-second resend cooldown, fresh Turnstile for protected resend, error/retry/back handling. It is not a simulated acceptance screen.
- All seven production onboarding steps use one progress header, typography, cards, input/select/chip styling and footer. Identity validation, location choice, intentions/values, biography, lifestyle/interests and the photo upload/reorder/cover/remove flow remain functional. Failed save preserves entered data and stays on the step.
- Discovery: left swipe passes, right swipe likes, 72px gesture threshold. Visible choice/like/spark feedback; one action per gesture and advance only after successful request. Private Say hello remains editable and unsent until explicit Send.
- Chat: authenticated image and document upload/download, staged attachment preview, file names and download controls, caption/file retention after failure, and retry. Successful packet clears only the caption/files actually sent, not later edits. Packet/quote length protected. Authenticated blob cache shares references safely, including retired in-flight requests and remounts.
- Documents: PDF, TXT, CSV, DOCX, XLSX, PPTX, maximum 8MB, MIME/signature/filename checks. These checks are not antivirus or a full Office parser. Unknown/untrusted kinds remain blocked; document downloads use authenticated routes and attachment/CSP headers.
- Real `MediaRecorder` preview/send flow keeps recorded preview after failed upload. Voice and document controls have dark ink on light outgoing reference bubbles. Real socket typing notices drive dots, with expiration; no scheduled fake reply/typing.
- Verification: camera cannot start before challenge resolution; concurrent challenge/camera/submit guards; 12s challenge and 125s submit deadlines; closed attempts aborted. Frozen capture evidence retained. Unavailable face detection never claims `singleFace: true`. Unknown verdicts, transport failures and review-only cases never grant the badge. No completion-time promises.

## Latest local evidence

| Check | Result |
|---|---|
| Default `npm run build`, Node 24, clean `.next`, 768MB | Passed; fixture public auth URL/key only |
| ESLint / TypeScript | Passed |
| Trust harness | 624/624 |
| Local API contracts | 23/23; substituted adapters |
| Chat-media contracts/cache lifecycles | 26/26; substituted adapters |
| Verification route/database suite | 62/62 across main 13, adversarial 15, ratelimit 10, legacy 7, single-engine 8, refused 9 |
| Engine-request regressions | 10/10 |
| Browser setup/interaction suite | 28/28 at 393×852 and 1440×1000 |
| Browser chat/verification suite | 26/26 |
| Browser general screen suite | 39/39 |
| Combined browser suite | 93/93, zero page errors; 164 capture operations / 154 distinct saved frames and result JSON in evidence |
| Migration manifest | 54 steps validated |
| Document migration on local PostgreSQL | Applied twice; image/video/voice/file accepted; unknown kind rejected; fixture inserts rolled back |
| Static route reachability | 26 member entries, 89 sources; no banned legacy member views reached |
| Secret scan / diff whitespace | Passed |

Browser evidence uses intercepted API/auth responses, fixture identities, a fake camera/microphone and a local WebSocket. It verifies actual production UI request/lifecycle behavior, not hosted delivery/persistence. The route suite uses a real local PostgreSQL database but a controlled HTTP vision double; it does not measure biometric accuracy or hosted RLS. Image decoding is asserted, not merely a placeholder becoming visible. An earlier test-only zero-byte JPEG upload was corrected by passing an explicit buffer without weakening that assertion.

## Release dependency and honest limits

1. **Hosted document sending is blocked until the additive migration is reviewed/applied.** Read-only inspection found hosted `chat_media.kind` accepts image/video/voice only. `20261121220000_chat_document_attachments.sql` adds `file`; Drizzle and the 54-step clean-start manifest agree. This work did not apply it to the hosted project.
2. Hosted email configuration was inspected read-only: confirmation required, six digits, 3600s expiry, 60s SMTP interval, code template and Turnstile. Real mailbox delivery, live CAPTCHA, account signup/OTP acceptance, Google OAuth and hosted RLS were not exercised or mutated.
3. Physical iOS/Android camera/microphone behavior, actual face/pose/anti-spoof accuracy and real provider acceptance remain release tests. Fake-camera UI success is explicitly not evidence for them.
4. All seven onboarding screens were inspected/captured. Only the intentions onboarding sample was supplied, so the remaining six are consistent extensions—not a pixel-perfect match to unseen designs. Native accessible controls and full production fields intentionally remain.
5. Refreshed comparison covers 37 supplied-reference pairs; none is pixel-exact. Discover crop/controls, member detail, real-data list density/statistics, full forms, consent/error disclosures and unavailable membership checkout differ. See `evidence/setup-media/reference-comparison.json` and the self-contained updated comparison.

## Evidence layout

`evidence/setup-media/` contains optimized captures for all three browser suites, their original result JSON, route comparison JSON and local build/test logs. `/home/user/freeborn-audit/Freeborn-Setup-Media-Review.html` is the self-contained latest review. `/home/user/freeborn-audit/Freeborn-Updated-Reference-Comparison.html` is the 37-pair reference comparison. No credentials or real member records are included.
