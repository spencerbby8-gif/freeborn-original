#!/usr/bin/env python3
"""Per-system client-side mine: discovery/ranking, matching, messaging, realtime, verification,
privacy, moderation, account lifecycle. Counts are only meaningful with samples, so every row
prints its own evidence; a 0 means the pattern cannot see it, not that the app lacks it."""
import io, os, re, json
from collections import defaultdict
ROOTS=["re/analysis-2026-10-29","re/analysis-2026-10-30/acquired-2026-10-30T","re/analysis-2026-10-30/tinder-recovered","re/bundles"]
SYS = {
 "realtime":      r"(\bnew WebSocket\(|socket\.io|pusher|ably|Ably|mqtt|EventSource\(|server-sent|\bSSE\b|subscribeTo\(|graphql-subscription|subscriptions-transport)",
 "ranking":       r"(recommendationScore|rankingScore|\bscore\b\s*[:=]|\breloadDeck\b|deckQueue|candidatesPerPage|prefetch\(|infiniteQuery|useInfiniteQuery|cursor:\s*|offset:\s*)",
 "matching":      r"(mutualLike|isMatch\b|matchId|superlike|superLike|swipeLeft|swipeRight|swipe_action|instant-match)",
 "messaging":     r"(typingIndicator|isTyping|markSeen|readReceipt|deliveredAt|messageStatus|\boptimistic\b|pendingMessage|retryQueue|outbox)",
 "verification":  r"(selfie|liveness|face[Ss]can|poseChallenge|documentScan|jumio|onfido|veriff|persona|yoti|idV[ei]rification|photoVerification|deviceAttest|playIntegrity|Safety[Ss]core)",
 "privacy":       r"(incognito|invisibleMode|hideDistance|hideAge|hideLikedMe|lastActive|discoveryPaused|travelMode|blurPhotos|privatePhotos|profileVisibility)",
 "moderation":    r"(reportUser|\breport\b[A-Z]?|blockUser|appeal|moderation|ban[A-Z]?[a-z]*|shadowban|safetyTips|photoEvidence|nudityFilter|imageBlur|unsafeContent)",
 "lifecycle":     r"(deleteAccount|deactivate|gdpr|dataExport|downloadYourData|exportData|cancelSubscription|unsubscribe|restorePurchases|deletionRequest|anonymi[sz])",
 "media_pipeline":r"(createObjectURL|exif|EXIF|orientation|\bquality\b\s*:|maxFileSize|file_size_limit|allowedMime|uploadProgress|multipart|partNumber|blobToDataUrl)",
 "failure":       r"(retryDelay|shouldRetry|maxRetries|attemptNumber|backoff|resource_exhausted|Retry-After|timed?[ _]?out|offline|degradedMode|circuitBreaker)",
}
res=defaultdict(lambda: defaultdict(list)); files=0; total=0
for root in ROOTS:
    if not os.path.isdir(root): continue
    for dp,_,fns in os.walk(root):
        for fn in sorted(fns):
            if not fn.endswith((".js",".css",".html")): continue
            p=os.path.join(dp,fn); b=io.open(p,"rb").read(); t=b.decode("latin-1")
            files+=1; total+=len(b)
            app="tinder" if "tinder" in fn or "tinder" in dp else "bumble" if "bumble" in fn or "bumble" in dp else "hinge" if "hinge" in fn or "hinge" in dp else "shared"
            if app=="shared": continue
            for k,pat in SYS.items():
                for m in re.finditer(pat,t):
                    w=re.sub(r"\s+"," ",t[max(0,m.start()-70):m.end()+70])
                    if any(ord(c)<9 for c in w): continue
                    if len(res[k][app])<400: res[k][app].append({"file":fn,"offset":m.start(),"m":m.group(0)[:40],"w":w})
out={}
print(f"scanned {files} files / {total:,} bytes\n")
print(f"{'system':16s} {'tinder':>7s} {'bumble':>7s} {'hinge':>7s}")
for k in SYS:
    row={a:len(v) for a,v in res.get(k,{}).items()}
    out[k]={a:{"count":len(v),"distinct":sorted({s['m'] for s in v})[:12],"samples":v[:3]} for a,v in res.get(k,{}).items()}
    print(f"{k:16s} {row.get('tinder',0):7d} {row.get('bumble',0):7d} {row.get('hinge',0):7d}")
io.open("re/analysis-2026-10-30/rea/SYSTEMS-MINE.json","w").write(json.dumps({"files":files,"bytes":total,"patterns":SYS,"results":out},indent=1))
