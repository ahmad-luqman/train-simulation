# Phase 7 Chrome browser acceptance — 11 September 2026

Tested the local development build in an isolated Chrome Incognito window using native browser interaction, after explicit user authorization. Hardware: Apple M4 Max. Chrome 152, macOS, DPR 2. Desktop window: 1728 × 886 CSS pixels; map: 1136 × 731. Responsive device emulation used 375 × 667 portrait and 667 × 375 landscape without CPU/network throttling. Emulation is not evidence from physical iPhone hardware or Safari.

## Observed passes

- Desktop railway and detailed locomotive asset render. Roster selection, running/paused states, 8× speed and moving-train follow camera work.
- Named IndexedDB slots save and survive a full page reload. Overwrite confirmation can be cancelled. Saving preserves focus; overwrite confirmation receives focus; cancelling returns it to the invoking Save button. A persisted manual save restored the expected $424,463 treasury and paused state.
- Actual JSON download (574 KB) and performance-report download completed through native Save dialogs. Importing `{ "version": 99 }` showed “This save version is not compatible.” without replacing the railway. Importing the exported valid railway, then confirming, restored it and created Recovery. Temporary railway files were moved to `/tmp` after testing.
- A real rotating autosave appeared during campaign play, labelled “campaign · 14 min.” It survived reload and later restored the 23-track campaign and $89,917 treasury, with pause and Recovery intact.
- Started a new guided campaign with the recovery option enabled. Selected Timberline, paused, built Grand Junction–Riverside’s left-side second running line for $55,704, set it to Both directions in Dispatcher, selected the purchased track in Services, assigned it, released both starters and ran at 8×. The first four tutorial items completed. The first observed delivery was 42 units; later the browser showed 126 units, including 42 flour delivered for $4,200. Civil engineering research succeeded for $6,000. Timetable editing succeeded; the queue-resolution milestone was not completed in this walkthrough.
- Region and construction offices receive focus on entry; Escape closes them. Save confirmation can be accepted with Return. Rain occurred during campaign play. The Night preset was selected during the session; reduced decorative motion toggled successfully.
- Forced real WebGL loss through `WEBGL_lose_context` in DevTools. The game paused, displayed a notice and allowed saving. Restoration resumed rendering and kept the game paused. A subsequent save load rebuilt the scene without console errors or warnings after the cleanup fix.
- Portrait overview, save library and the scrollable controls panel were visually inspected. Landscape overview and the scrollable atmosphere dialog were inspected; all observed controls remained reachable. The screenshots record these views.

## Fixes found by this walkthrough

1. Save actions lost keyboard focus, and successful import confirmation retained an earlier error. Actions now preserve/restore focus and clear stale feedback; file validation also uses the busy state.
2. Tutorial instructions referred to a “negative bend” absent from the menu. They now name Second running line and Left of main track, and explain the held starter services.
3. Dispatcher and routing selectors used original slot names after engine reassignment. They now show the current service and assigned engine. Inspector wagon labels now reflect the actual consist.
4. Follow status overlapped the tutorial prompt. It now sits above the lower map controls.
5. The narrow toolbar overlapped lower controls, and larger touch targets overflowed the fixed footer. Narrow maps now have a Railway controls toggle and scrollable panel; the footer sizes to its content, with compact landscape positioning.
6. Clearing a timetable number produced React NaN/value warnings. Empty edits now render as empty values while native required/range validation remains active.
7. The installed Three renderer warned that PCFSoftShadowMap was removed. The scene now requests its supported PCFShadowMap directly.
8. Disposing/rebuilding a previously restored scene produced stale-buffer WebGL warnings. The loss handler now releases GPU allocations/listeners while the lost context owns them, retaining CPU geometry for restoration. The loss → restoration → autosave-load sequence then showed No errors and No warnings.

## Automated verification after fixes

All 115 regression tests passed (92.25 seconds), with typecheck, lint and the production build also passing. The existing large client-chunk and route-classification build advisories remain.

## Measurements and limits

`desktop-balanced.json` is the actual exported baseline: 1,800 samples, p50 8.3 ms, p95 16.7 ms, p99 17.4 ms, CPU submission p95 10.4 ms; 3,588 draw calls and 1,118,704 triangles. It predates the browser-found fixes and is a development-build overview sample, not a final production/device benchmark or GPU timer result.

The native computer-control service began returning `cgWindowNotFound` during the 175% → 200% desktop zoom check and continued failing for Chrome and Finder after reconnection and a session reset. Thus 200% visual acceptance, the final keyboard traversal of the compact toolbar, reduced-motion persistence after reload, the empty-number-field console retest, final desktop follow-badge placement, all quality/camera/photo-download combinations and repeated unmount profiling remain open. The final compact-toolbar adjustment keeps it open behind an office so Escape can return focus to its still-visible opener; that small adjustment passed code checks but awaits browser recheck. No full campaign/challenge victory, corrupted-IndexedDB fault injection, Safari/real-touch matrix, production-browser acceptance, sixty-minute continuous soak, retained GPU-memory plateau, first-time-player study or independent review is claimed here.

Screenshots are native full-window captures and include DevTools where relevant. The context-loss/restoration captures show the original successful pause/recovery sequence; the later cleanup fix was verified by the fresh console and autosave-load observations above. No live Site publication was performed during this testing pass.
