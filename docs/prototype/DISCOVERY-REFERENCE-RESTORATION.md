# Discovery reference restoration

## Requested visual target

Use the user's first attached two-phone design, specifically its LEFT discovery screen, rather than the later flat-card override. Preserve the current four bottom tabs exactly. Real member photos, names, profile fields, presence and verification remain data-driven; the illustrated Aria profile is not inserted into the live member deck.

- Midnight-navy surface and cream serif headline.
- Rose intention/value chips and a gold flame control that still opens real discovery filters.
- Two visible stacked-card edges, thin warm border, rounded/clipped portrait and lower black gradient.
- New-member label and top-right like action when warranted by the member data.
- Name, genuine identity badge, occupation/city, height/presence when available, interest pills and short bio over the lower photo.
- Pass / cream-gold Say hello / Spark **inside** the card, not outside below it.
- No extra technical GPS-explanation row. The city/time eyebrow itself is an accessible location-refresh button.
- Only Discovery opts into the reference heart-shaped notifications link. It still opens notifications and shows actual unread counts. Other screens retain their existing bell.

## Bottom navigation is unchanged

`src/components/prototype/frame.tsx` and its tab definitions are untouched. No tabbar/tab CSS rules were changed. Labels, order, routes, icons, active state and badges remain Discover / Likes / Messages / Profile.

All replacement visual rules are scoped beneath `.discover-scroll` so they do not restyle the shared landing-page demonstration cards or other member screens.

## Viewer-local time

The existing location hook updates on mount, every minute and on returning to the tab. The heading uses the device's LOCAL hour, not server UTC, a candidate's city, or a fixed nighttime string:

| Device-local hour | Heading |
|---|---|
| 05:00–11:59 | Morning in [viewer city] |
| 12:00–16:59 | Afternoon in [viewer city] |
| 17:00–20:59 | Evening in [viewer city] |
| 21:00–04:59 | Tonight in [viewer city] |

A granted, resolved viewer location is shown even when discovery filtering is set to Anywhere. Without location consent or a resolved city, show the honest generic eyebrow rather than inventing Enugu or Brooklyn. Tap the eyebrow to request/refresh location. Device clock/timezone must be configured correctly.

## Verification

- `npm run test:discovery-presentation`: boundary-hour and truthful-data contracts.
- `node scripts/prototype/discovery-settings.cjs`: existing 26-check mobile/desktop regression suite, using a separate fixture build.
- `node scripts/prototype/discovery-reference.cjs`: 48 browser checks across 360×740, 393×852, 430×932 and 1440×1000; captures morning/afternoon/evening/night plus request and choice errors. Checks action containment, card layering, no horizontal overflow, unchanged four navigation links, time-zone transitions and minute ticking.
- The visual renderer test requires a configured application. Local fixture builds use only `https://fixture.supabase.co` and `fixture-publishable-key`. For a deployed renderer check, explicitly set `FREEBORN_DEPLOYED_VISUAL=1` and the approved HTTPS preview origin. All auth/provider/API responses are intercepted in the browser; synthetic tokens never reach the backend.
- Deployed-renderer screenshots prove the deployed HTML/CSS/JS rendering, NOT successful real authentication, member delivery, database/RLS acceptance or resolution of previously reported authenticated 500 errors.

No member data, production environment, verification record, auth guard, database or navigation was changed to obtain a screenshot. Backend 500 errors must remain visible rather than silently showing sample members or fake empty success.
