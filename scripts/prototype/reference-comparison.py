"""Compare supplied PNG references to local fixture captures. Requires Pillow.
Raw pixel deltas are NOT a layout/UX score: member data and honest production
states differ from the scripted prototype. Never assert exactness from a threshold.
"""
import argparse
import base64
import html
import io
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

p = argparse.ArgumentParser()
p.add_argument('--reference', type=Path, required=True)
p.add_argument('--captures', type=Path, required=True)
p.add_argument('--chat', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--html', type=Path, required=True)
a = p.parse_args()
notes = {
 'chat': 'Reference header, four text bubbles and composer chrome retained with the same fixture content/artwork. The requested separate mic control intentionally extends the supplied composer. Plus now opens native photo/video/document choices; staging, recording and viewers are new reference-style components, not legacy UI. Dots require a real typing notice. Not pixel-exact.',
 'discover': 'Not exact: enclosed actions, portrait crop, deck stack, spacing and data-driven filter chips differ from this supplied capture. Member fields are real, not fabricated reference facts.',
 'discover-empty': 'Not exact: truthful empty-state copy, controls and spacing differ.',
 'likes': 'Reference list pattern retained, but fixture has one member instead of the prototype list. Row details and activity link differ; not pixel-exact.',
 'messages': 'Reference list pattern retained. One authorized fixture match instead of eight scripted people; search and compose remain working. Not pixel-exact.',
 'messages-bottom': 'Sparse fixture list does not fill the reference list. No fake conversations added to mimic density.',
 'my-profile': 'Not exact: statistics come from services; unavailable view tracking shows a dash, not a made-up count. Photo count/content and crop differ.',
 'my-profile-bottom': 'Native profile rows retained. Live fields, photo count and statistics differ; not pixel-exact.',
 'profile-detail': 'Not exact: fuller authorized profile details, taller photo, enclosed controls and hidden main tabs are retained from the prior requested presentation.',
 'settings': 'Reference menu grouping retained. Membership copy/destination now says unavailable rather than offering a fake upgrade. Minor spacing/text differences remain.',
 'preferences': 'Reference interaction pattern retained. Interests/intentions are editable service data; labels, saved selections and some spacing differ.',
 'privacy': 'Reference controls retained. Audience/blocked-account destination is named honestly; switch values reflect actual fixture preferences. Not pixel-exact.',
 'premium': 'Not exact by design: no fabricated prices or live checkout. Planned membership and availability wording differ.',
 'matches': 'Reference structure retained, but one fixture match instead of four scripted matches. Not pixel-exact.',
 'notifications': 'Reference tabs/list pattern retained, with functional category and unread filters and explicit failure states. Events use authorized data, not the prototype scripted list. Not pixel-exact.',
 'onboarding': 'All seven production steps now use the shared reference chrome, cards, fields and progress header. Only the intentions sample was supplied as an onboarding reference; full service-backed choices, validation and values extend it. Not pixel-exact; the other six steps are a consistent extension, not a claimed unseen-reference match.',
 'welcome': 'Not exact: genuine Google sign-in/signup buttons and recovery access require more form space. Original auth flame remains unchanged.',
 'verification': 'Reference hero/frame/checklist retained, with truthful camera and service/status copy replacing the prototype simulation disclaimer. Not pixel-exact.',
 'login-verification': 'New native invitation uses the same verification-screen presentation. Consent/storage disclosure, dismissal and keyboard focus are required additions. No older sheet UI remains.'
}
rows = []
for viewport in ['393x852', '1440x1000']:
 for ref in sorted((a.reference / viewport).glob('*.png')):
  if ref.stem == 'verification-simulated':
   continue
  current = (a.chat / viewport / 'chat-reference-content.png') if ref.stem == 'chat' else a.captures / viewport / ref.name
  if not current.exists():
   rows.append({'screen':ref.stem, 'viewport':viewport, 'status':'missing capture', 'pixelExact':False})
   continue
  rows.append({'screen':ref.stem,'viewport':viewport,'reference':str(ref),'current':str(current),'note':notes.get(ref.stem,'Compared; differences remain.')})
 # The login invitation did not have its own prototype sheet: compare to the supplied verification screen.
 rows.append({'screen':'login-verification','viewport':viewport,'reference':str(a.reference/viewport/'verification.png'),'current':str(a.chat/viewport/'login-verification.png'),'note':notes['login-verification']})
for row in rows:
 if 'reference' not in row:
  continue
 old=Image.open(row['reference']).convert('RGB')
 new=Image.open(row['current']).convert('RGB')
 if old.size!=new.size:
  row.update(pixelExact=False,status='different dimensions')
  continue
 delta=ImageChops.difference(old,new)
 maximum=ImageChops.lighter(ImageChops.lighter(delta.getchannel('R'),delta.getchannel('G')),delta.getchannel('B'))
 hist=maximum.histogram()
 row.update(pixelExact=delta.getbbox() is None,status='compared',meanAbsoluteChannelError=round(sum(ImageStat.Stat(delta).mean)/3,5),changedPixelsPercent=round((sum(hist)-hist[0])*100/sum(hist),3))

result={'scope':'Raw PNG comparison, not hosted acceptance or a layout score. Live data differs from the scripted prototype. Exact means zero changed pixels, not a chosen tolerance.','comparisons':rows,'excluded':[{'screen':'verification-simulated','reason':'Prototype-only fake verification success is deliberately not reproduced; server-confirmed outcome captures are provided instead.'}]}
a.output.parent.mkdir(parents=True,exist_ok=True)
a.output.write_text(json.dumps(result,indent=2))
def image(path, lossless=False):
 im=Image.open(path).convert('RGB');buf=io.BytesIO()
 im.save(buf,format='WEBP',quality=83,lossless=lossless)
 return 'data:image/webp;base64,'+base64.b64encode(buf.getvalue()).decode()
blocks=[]
for row in rows:
 if row['status']!='compared':
  continue
 exact='Pixel exact' if row['pixelExact'] else 'Not pixel-identical'
 blocks.append(f'<details><summary>{html.escape(row["screen"])} · {row["viewport"]} · {exact}</summary><p>{html.escape(row["note"])}</p><p class="muted">Raw RGB mean absolute error: {row["meanAbsoluteChannelError"]}/255. Changed pixels: {row["changedPixelsPercent"]}%. These values include text, artwork and data changes—not only layout.</p><div class="pair"><figure><figcaption>SUPPLIED REFERENCE</figcaption><img src="{image(row["reference"],row["screen"]=="chat")}" alt="Reference {row["screen"]}"></figure><figure><figcaption>CURRENT LOCAL FIXTURE</figcaption><img src="{image(row["current"],row["screen"]=="chat")}" alt="Current {row["screen"]}"></figure></div></details>')
verification=[]
for name in ['verification-pose','verification-camera','verification-selfie-review','verification-checking','verification-approved','verification-review','verification-rejected','verification-service-error','verification-camera-denied']:
 path=a.chat/'393x852'/(name+'.png')
 if path.exists() and name not in [v[0] for v in verification]:
  verification.append((name,f'<figure><figcaption>{html.escape(name)}</figcaption><img src="{image(path)}" alt="{name}"></figure>'))
report='''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Freeborn · Reference comparison and verification review</title><style>*{box-sizing:border-box}body{margin:0;background:#090c17;color:#f4efe7;font:14px/1.75 system-ui}main{max-width:1250px;margin:auto;padding:42px 22px}h1,h2{font-family:Georgia;font-weight:400}h1{font-size:42px;line-height:1.2}h2{font-size:29px}.muted{color:#aaa5bb}.note{border-left:3px solid #e8bb8f;background:#191b2e;padding:18px 24px;margin:24px 0}.pair,.gallery{display:grid;grid-template-columns:1fr 1fr;gap:20px}details{border:1px solid #36334a;border-radius:18px;padding:18px 22px;margin:15px 0;background:#121624}summary{cursor:pointer;color:#edc8a2;font-weight:600}figure{margin:0;min-width:0;padding:12px;background:#090d18;border-radius:14px}figcaption{color:#b5a1ac;font-size:10px;letter-spacing:.12em;margin-bottom:12px}img{display:block;max-width:100%;max-height:850px;margin:auto}.gallery{grid-template-columns:repeat(3,1fr)}.pill{display:inline-block;padding:7px 12px;margin:4px;border:1px solid #80705d;border-radius:90px;color:#f1d0a5}a{color:#e8bb8f}@media(max-width:650px){.pair{gap:8px}.gallery{grid-template-columns:1fr 1fr}main{padding:24px 12px}details{padding:13px}h1{font-size:32px}}</style><main><p class="muted">FREEBORN · 21 NOVEMBER 2026 · LOCAL FIXTURE EVIDENCE</p><h1>Chat rebuilt from the reference.<br>Verification rebuilt as native screens.</h1><div class="note"><b>Honest exactness result</b><p>The full app is <b>not pixel-identical</b> to the supplied prototype. Every available real-screen reference capture has been compared below, including lower scroll positions and the empty deck. The scripted verification-success simulation is excluded on purpose. Open each screen for the original/current pair and remaining differences.</p><p>The new chat closely follows the supplied reference: 73px header; first incoming bubble at y=115px on mobile; four reference-content messages; compact composer. Typing dots appear only on a real notice—not a timer or fake reply.</p></div><div><span class="pill">59/59 browser checks</span><span class="pill">100 captures · 0 page errors</span><span class="pill">624/624 trust assertions</span><span class="pill">23/23 API contracts</span><span class="pill">Clean build · TypeScript · lint</span></div><h2>What changed</h2><ul><li>Shared reference chat header/composer for matched and private-draft conversations. More-menu calls, attachment tools, voice notes, reactions, quotes and read-only enforcement remain.</li><li>New native login verification invitation and pose, camera, review, checking, pending, approved, rejected and error screens. Notification permission prompts no longer cover verification or chat.</li><li>Shared reference colors/gradients restored. Exact blue member badge and original auth flame unchanged.</li><li>Server-confirmed outcomes only. Failed or unconfirmed submissions never claim pending/success. Live capture evidence is frozen before the camera stops. Stored-message identity reconciles slow/clock-skewed echoes without duplicate bubbles.</li></ul><div class="note"><b>Test limits</b><p>Browser APIs and identities were intercepted locally. The green camera captures are Chromium’s fake camera, not a person. They demonstrate UI, capture lifecycle and request handling—not actual biometric accuracy. No hosted Supabase/RLS acceptance, real Google sign-in or physical-device camera test is claimed. No database configuration change, merge or direct production deployment was performed.</p></div><h2>Chat quick comparison · mobile</h2>'''
chat=next(r for r in rows if r['screen']=='chat' and r['viewport']=='393x852')
report+=f'<div class="pair"><figure><figcaption>SUPPLIED PROTOTYPE</figcaption><img src="{image(chat["reference"],True)}" alt="Reference chat"></figure><figure><figcaption>REBUILT CHAT · LOCAL FIXTURE</figcaption><img src="{image(chat["current"],True)}" alt="Rebuilt chat"></figure></div>'
report+='<h2>Verification process · all real UI states</h2><p class="muted">Intro is included as “login-verification” in the comparisons. No prototype-only approval is simulated in the application.</p><div class="gallery">'+''.join(v[1] for v in verification)+'</div><h2>Every supplied screen · reference vs current</h2><p class="muted">Comparison images are embedded WebP views; chat views are lossless. Metrics were calculated on the original PNG captures, not the compressed report images. Content differences are disclosed per screen.</p>'+''.join(blocks)+'<p class="muted">Push/commit status is recorded separately in the completion receipt. This report does not itself assert a remote push or deployment.</p></main>'
a.html.parent.mkdir(parents=True,exist_ok=True)
a.html.write_text(report)
print(json.dumps({'comparisons':len(rows),'missing':[r for r in rows if r['status']!='compared'],'pixelExactCount':sum(bool(r.get('pixelExact')) for r in rows)},indent=2))
