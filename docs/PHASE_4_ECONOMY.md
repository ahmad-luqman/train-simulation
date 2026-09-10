# Phase 4 — Transport economy

## Implementation plan

Reviewed `d006e46` through `d977c6e`, the advanced roadmap, physical dispatch and version 5 persistence before implementation. The user's explicit instruction to implement Phase 4 authorizes proceeding with economy work while the previously documented browser/GPU and independent-review acceptance backlog remains open. This does not certify or remove those gates.

1. Separate a deterministic economy module from physical dispatch. Use integer cargo and dollar accounting, finite source stocks, storage-limited processors and consumer demand. Preserve three freight chains and a separate passenger queue model.
2. Load only on an admitted physical departure; unload only at an actual scheduled call. Retain rejected cargo aboard. Keep wagon compatibility, capacity, loading throughput and actual mass consistent. Recovering or passing through stations must not create deliveries.
3. Record every cash mutation in one journal, including construction and refunds. Charge periodic fuel, crew, maintenance, infrastructure and interest; provide route-level accounts, bounded debt and explicit unlimited-funds grants.
4. Add opt-in local contracts with simulation-time deadlines, one-time rewards/penalties and repeatable recovery opportunities. Surface inventories, demand, tariffs, warnings and accounts in an Economy office matching the existing railway-office style.
5. Persist version 6, validate a detached candidate including conservation and journal reconciliation, migrate version 5 without relocating trains or inventing historic manifests, and preserve old browser slots.
6. Verify conservation, processing, rejected loads, accounting, financing, contracts, save corruption and deterministic continuation; retain full-fleet physical separation and progress tests. Run the full suite, typecheck, lint and production build before committing and pushing.

## Design decisions

- Monetary values and cargo units are integers. Production uses whole simulation seconds; operating bills use complete simulation minutes. No offline earnings.
- Timber: Pinecrest → Riverside sawmill → lumber to towns. Grain: Millbrook/Fairwater → Grand Junction mill → flour to towns. Coal: Coalhaven → Grand Junction industry → goods to towns. Processing is one input unit to one output unit, with both counted explicitly.
- Passengers have finite waiting queues and destination acceptance. They remain separate from freight compatibility and industrial recipes.
- Flat wagons carry timber/lumber; hoppers carry coal/grain; box wagons carry flour/goods; coaches carry passengers. A service uses one compatible wagon family, choosing available cargo for its next actual call. Refitting requires an empty, stopped train.
- Destination capacity can change while a train is travelling. Rejected units remain aboard and earn nothing. Recovery retains the original manifest.
- Forgiving contracts begin when accepted, avoiding deadlines expiring while the player learns the interface. Missing a contract costs a small stated fee and allows another attempt.
- Operating cash may go negative; trains continue, with purchases blocked until affordable. Limited loans and explicit sandbox grants allow recovery. Loans and capital purchases are separate from operating profit.

## Verification

Implementation and measured results will be recorded below when checks finish. Browser testing requires an explicit request under the Sites environment skill, so no new browser/GPU acceptance is claimed by automated checks.

## Delivered behavior

- `economy.ts` owns stock, recipes, manifests, tariff rates, the cash journal, contracts, loans and detached restore validation. It runs on integer simulation seconds; the world still moves at 50 ms ticks. Tick accumulator roundoff is normalized, so equal 1×/3×/8× runs serialize identically.
- Each town stores up to 180 units of each commodity. Producers add two raw units per five seconds; processors transform two units per five seconds; consumers use two finished units per five seconds. Passengers use separate finite waiting and received queues at the same rate. Output stores fill before processing pauses, retaining unused raw input.
- Copper Creek starts on `[Coalhaven, Grand Junction]` with hoppers; Golden Valley on `[Millbrook, Grand Junction]` with hoppers. Timberline retains its Pinecrest/Riverside/Grand Junction flat-wagon route. Red Mesa starts with box wagons. The other eight trains use coaches. Existing saved service routes remain unchanged on migration.
- Cargo selection prioritizes an active contract at the next scheduled call, then the largest compatible available source stock. Consumer stock is not available for re-export. Loading is capped by 18 units per wagon, 12 units per configured dwell second, available stock and current destination demand. Actual manifests determine displayed load and traction mass.
- Payment occurs only at the manifest destination on a scheduled physical call. Partial or complete rejection remains aboard, is recorded with a zero or partial payment, and warns the player. Physical recovery and intermediate route nodes do not create deliveries.
- Four procedural wagon silhouettes match their family and remain within the existing physical envelope. Refit costs $2,500 and requires an empty, stationary train. Additional wagons cost $8,500, preserve cargo and update the load factor. A loaded train cannot edit its service away from its delivery destination.
- Per accepted unit: passengers $45; timber $70; grain $60; coal $65; lumber $105; flour $100; goods $120. No hidden freshness, punctuality or distance modifiers.
- Per full simulation minute: crew $6/train; maintenance $3/train + $1/wagon; fuel $0.30 per scene unit travelled; infrastructure $0.02 per scene unit of track + $1/platform. Fuel and infrastructure round up to whole dollars. Part-minute activity carries to the next bill and survives saves. Held and depot trains retain crew/maintenance expense.
- All cash flows use the same journal, including old construction/refund commands, wagon purchases, loan principal and sandbox grants. Operating profit includes delivery/contract income less the stated operating costs and penalties; capital and financing remain separate. Route accounts attribute direct train income/costs and explicitly exclude shared infrastructure/interest.
- Six contract offers start 30- or 40-minute deadlines when accepted. Rewards are $8,000/$10,000 and failure fees $1,000/$1,500. Settlement happens once; retry is available after completion or failure. Saved progress is checked against qualifying journal deliveries after acceptance.
- Borrow in $25,000 steps to a $100,000 limit; interest is 0.2% of principal per simulation minute ($50/minute per $25,000). Repay principal separately. Negative operating cash does not halt trains or corrupt saves; standard purchases require funds. Unlimited mode journals the exact grant required for a purchase, keeping its costs visible.
- The Economy office includes a commodity supply/demand plan, numerical inventory table, tariffs and chain instructions, refit/hold/release controls, route accounts, contracts, financing and a paginated journal. The top bar displays net operating profit. The main React view now initializes its simulation once, avoiding rebuilding physical topology on every UI refresh.

## Persistence

Version 6 saves preserve clocks, stocks, conservation counters, manifests, wagon families, empty-running warnings, operating bills, principal, contracts and every cash entry. Restore reconciles cargo across source stores, processor consumption, towns and trains; balances/debt, delivery amounts/tariffs, train totals and contract settlements must agree before any live state changes. Geometry and physical authority retain all existing validation.

Version 5 uses the same physical map and migrates in place. Positions, routes, cash and historic train revenue/delivery totals are retained, with an explicit opening-balance entry. Generated legacy loads are cleared because no source inventory backed them; real manifests begin at subsequent departures. Historic totals are retained separately rather than fabricated as Phase 4 deliveries. Versions 1–4 still fail atomically. Browser storage uses a new v6 slot and preserves all older slots.

## Automated evidence — 10 September 2026

- **75 tests pass**, including 15 economy tests, the original full-fleet passenger delivery gate over two 1,800-second windows and a separate default mixed-freight full-fleet soak over the same duration. Both keep independent geometric separation checks every tick. Every mixed service calls in both windows; every raw-material processor receives input; processed cargo reaches consumers.
- All three chains have controlled producer → processor → consumer conservation tests. Additional tests cover storage saturation, partial/full rejection and retry, passenger exhaustion, wagon/dwell limits, refit failures, exact purchase/refund accounting, limited loans, interest, overdraft recovery, contract success/failure/retry, corrupt saves, version 5 pose preservation, and deterministic 1×/3×/8× continuation with cargo aboard.
- A capacity/dwell comparison verifies that a suitable wagon upgrade increases direct operating profit while still charging its capital cost. Repeated empty service cannot create revenue. Freight silhouettes remain inside the shared vehicle envelope.
- **Regression disposition:** the original isolated and all-fleet delivery fixtures now explicitly use real passenger queues on their original routes, retaining their delivery thresholds and both continuation windows. Their cash assertions include ledger expenses. Sparse freight delivery is tested separately, not substituted for the original delivery gate. The original two-way loop scenario retains three calls per train in 1,200 seconds and simultaneous motion; a subsequent stopped-train direction restriction requires automatic loop use with concurrent motion and the same physical separation/restore checks. It no longer relies on incidental generated-load timing to require an otherwise unnecessary alternate.
- `npm run typecheck`, `npm run lint`, `git diff --check` and production build pass; final build is refreshed after final source edits.
- [Reproducible economy benchmark](benchmarks/phase4-economy.json), generated by `npm run benchmark:economy`: Apple M4 Max, darwin arm64; 3,600 simulation seconds in **16.09 seconds**, **0.224 ms/tick**, measured while the regression suite also ran. Revenue **$139,080**, operating expenses **$20,935**, net **$118,145**, cash **$543,145**, zero debt, 2,280 journal entries. All three accepted starter contracts complete. These are headless figures, not a GPU baseline or a promise of browser frame rate.

## Remaining acceptance and scope

Browser interaction/visual acceptance, 200% text enlargement, sustained GPU/frame-cost measurement and independent physical-system review remain open. The Sites environment permits browser testing only when explicitly requested; no browser screenshots or interactions were performed in this implementation. The existing local route responds successfully. Headless tests and production compilation do not certify the new office's rendered layout.

Phase 4 balances the three stated freight chains and one passenger queue model. Distinct locomotive capabilities, cargo mass by commodity, mixed wagon families within one train, depot servicing, campaign progression and detailed industrial buildings remain later-phase work. Rates deliberately use simulation minutes rather than real-world economic estimates. Long-run journal size grows with simulated time; the UI paginates it and save errors preserve the active railway and existing slot.

## Follow-camera correction

The reported screenshot showed Alpine Monarch in the off-network depot queue. Its hidden renderer group held Coalhaven’s station-center placeholder, and follow immediately zoomed to it. Camera subjects now come from authoritative vehicle poses only when the train is visible. A queued follow request preserves camera position, focus and zoom; the interface shows “Waiting for dispatch” and automatically acquires the locomotive when it enters a physical berth. Visible-train transitions ease both focus and zoom, then preserve manual zoom while tracking. Trackside rejects queued subjects without changing the camera mode.

Four focused camera tests cover the screenshot’s queued Alpine Monarch state in both projections, automatic physical-berth acquisition and on-screen centering, switching through a queued subject, smooth zoom, frame-rate independence and retained manual framing. Browser interaction and GPU acceptance remain separately open.

Follow-camera verification: all 79 regression tests, typecheck, lint and production build pass. The rebuilt local Worker responds with HTTP 200 at `http://localhost:8787`.

## Terrain burial correction

The Coalhaven and Riverside screenshots exposed an older expanded-map mismatch: physical station tracks retain their designed elevation while the procedural outer valley rises beneath the extended yards. At Coalhaven’s third berth stop, the terrain was 0.873 units high while the rail top was only 0.49. This hid both rails and lower vehicle bodies.

`rail-earthworks.ts` now grades the rendered terrain beneath every physical running line, turnout, platform, crossover and return loop. It lowers ground to track formation level, protects a full terrain-cell diagonal around the track bed to prevent triangle interpolation from covering rails, and blends cutting shoulders into the surrounding land. Platform clearance includes its adjacent walking surface. Railway geometry, vehicle positions, dispatch, construction prices and saves remain unchanged. This is a rendering correction to expose the existing alignment, not a new terrain-editing command.

Cuts are regenerated from the natural terrain on network rebuild, including construction, demolition, undo and load. They do not raise or fill the riverbed. Trees, rocks and camera ground clearance sample the same graded triangles. Regression tests reproduce the buried Coalhaven berth, sample both rails and ballast across every physical alignment, compare scenery height queries against raycasts onto the rendered mesh, and verify river preservation, restoration after removal and unchanged simulation state. Browser visual acceptance remains open.

Terrain-fix verification: all 82 tests, typecheck, lint and production build pass. At all three Riverside berth stops, natural ground was 1.917 units above datum while rails were at 0.49; graded ground is now 0. The local Worker reloaded the rebuilt source and responds with HTTP 200 at `http://localhost:8787`.
