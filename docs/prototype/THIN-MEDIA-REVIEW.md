# Thin message frames — owner correction

- Removed the padded outer bubble from photo/video/voice packets, including captioned media. There is no gradient frame around the photo frame.
- Photos have one 1 CSS-pixel border, no forced 4:3 crop, and no stretching or upscaling. Oversized photos scale proportionally to fit within 260 × 340 CSS pixels and the available chat width. Small images retain their intrinsic CSS-pixel size. Source upload bytes are not resized by this change; CSS pixels are not a promise of device-pixel 1:1 on high-density screens.
- Multi-photo packets stack uncropped photos rather than forcing a square grid.
- Voice notes use a 44px-high compact row, 1px outline, 30px play control, 2px seek line, time and speed. Recording preview is compact too. Text bubbles use lighter 1px outlines and smaller padding.
- Existing bearer-authorized media retrieval, full-size photo viewer, retry, explicit send, recording denial/cancellation, playback, pause, speed and typing remain wired.

## Verification

36 browser checks passed at 393×852 and 1440×1000, 70 captures, zero browser errors. New checks send actual 80×48, 900×1400 and 1400×600 PNG bytes, measure decoded image ratio/no-upscale and 1px/zero-padding frames, and verify the sent voice row is at most 48px high (44px observed) with no outer padding. Actual fake-device recording playback/time advance/pause/1.5× checks passed.

Production build, ESLint, TypeScript and 26 media contracts passed. Evidence is under `evidence/thin-media/`. Browser tests use intercepted local APIs and fake microphone/camera, not hosted or physical-device acceptance. One initial screenshot-capture protocol error was followed by a complete successful rerun; the final saved results are from that rerun.

No merge, production deployment or hosted database migration is performed by this change. Continue the existing draft PR #90, not a duplicate PR.
