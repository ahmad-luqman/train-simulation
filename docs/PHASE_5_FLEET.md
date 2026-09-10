# Phase 5 — fleet and mountain railway

## Implementation plan

1. Add a renderer-independent fleet model: twelve engine specifications, owned engine slots, fuel/water, condition, automatic service policy, depot jobs and mutually exclusive upgrades. Keep train/service IDs stable through replacement and sale.
2. Integrate traction, mass, fuel consumption and wear into fixed ticks. Use forgiving reduced performance and station warnings. Service at protected berths; never move a train or release its occupied protection to simulate maintenance. Station water/fuel stops and workshop maintenance have real downtime and ledger costs.
3. Add a fleet office with engine comparison, purchase/sale/replacement, service policy, workshop construction, ordered wagon editing and bounded upgrades. Preserve cargo compatibility and route assignments atomically.
4. Extend the map outward, retaining the original eight towns and thirteen corridors. Add six elevated destinations, graded approaches, ridge tunnels, ravine viaducts, alpine vegetation and mountain station facilities. Share structure classification between scenery and terrain cuts.
5. Version saves and migrate prior fleet state without changing geometry or authority. Validate depot jobs, engine ownership, consists, resources and upgrades before committing a restore.
6. Test fleet lifecycle, cost and inventory conservation, grade performance, maintenance consequences, mountain geometry and save restoration. Retain all-fleet safety/progress tests; run typecheck, lint and build. Record actual acceptance evidence and limitations here.

## Design decisions

- The existing twelve service slots are retained. Selling parks an empty service; purchasing fills that slot. Replacements retain service, manifest, position and authority.
- Consists support the economy's four cargo families. Tank wagons remain deferred until a liquid commodity exists; they would otherwise be unusable stock.
- Upgrades are exclusive: economy tuning trades traction for consumption; reinforced running gear trades speed for reliability; larger wagons trade mass for capacity.
- New geography extends the original world rather than stretching trains or changing old journey distances. Legacy layouts remain restorable.

## Delivered behavior

- **Twelve engine profiles:** mountain/heavy freight engines have stronger traction and higher running costs; branch and express engines have lower mass or higher speed. Each procedural model has its declared leading, driving and trailing wheel counts, with a distinct express skirt or heavy freight cylinders where appropriate. Replacement updates the roster, inspector and scene; Alpine Monarch retains its GLB showcase when fitted in its original slot.
- **Fleet office:** explicit comparison and net trade-in quote, purchase into a vacant service slot, sale of a stationary empty engine, replacement preserving cargo and service, ordered three-to-six-wagon consists, workshop construction, automatic-service policy and three exclusive upgrades. Additional length still uses the existing physical rear-clearance check. Mixed consists load one commodity per departure into matching wagons only. Capacity wagons stay with the consist when its locomotive is replaced.
- **Care:** condition, coal and water decline with movement. Low supplies and condition reduce performance instead of producing destructive breakdowns. Coal/water stops take six seconds. Workshops take 12–57 seconds; servicing restores condition and supplies. Fuel use is charged by actual distance and engine profile; workshop charges cover labor, repairs and water, without charging the same fuel twice. Pause freezes jobs and all wear.
- **Depot logistics:** Coalhaven, Grand Junction, Riverside and the six mountain stations start with workshops. Build another at a station for $18,000. An empty train needing service, whose itinerary has no workshop, takes the shortest available round trip to a workshop and then resumes its saved service at the original station. Loaded trains first finish their delivery. Transfer journeys do not load cargo. Their original route is protected against edits and demolition. Unreachable workshops leave the service operating in forgiving mode; connect a workshop or build one locally.
- **Mountain map:** fourteen stations, twenty-two corridors, 640 × 570 units of buildable land (2.54 times Phase 4), six corridors with covered alpine spans and two with elevated gorge spans in addition to existing river bridges. Gradients reach approximately 4.1%; rail elevations and vehicle pitch use authoritative geometry. Natural terrain stays over tunnel interiors; open alignments retain triangle-level earthwork clearance. Terrace towns, snow-colored peaks, exposed rocks, conifer groves and a glacial tarn vary the scenery. Alpine Monarch starts on the mountain circuit; other starter services retain their Phase 4 assignments.
- **Persistence:** version 7 stores all fleet resources, jobs, ordered wagons and suspended services. Versions 5/6 migrate without relocating vehicles or rewriting networks. The v6 browser slot is retained. Original Phase 3A layout fixtures and all original progress and collision assertions remain in the regression suite.

## Verification

- The full suite retains the original 82 tests and adds 9 Phase 5 tests. Fixture setup now initializes ordered consists alongside direct test-only wagon counts/families. Old curve preservation is checked on all thirteen original corridors; renderer/sample agreement still covers every corridor. The terrain-clearance test excludes only explicitly classified covered tunnel interiors and retains every open alignment check.
- Added tests cover engine performance and wheel envelopes; cargo-safe trade-in and sale; mixed capacity; pause and mid-job restore; preventive service versus neglect; automatic workshop transfer and original-route restoration; atomic malformed-save rejection; v6 migration; expanded topology; and repeated six-wagon mountain calls with independent geometric separation.
- [Reproducible fleet benchmark](benchmarks/phase5-fleet.json): 3,600 simulation seconds, all twelve services make calls in both 1,800-second windows. Alpine Monarch makes 14 calls, delivers 588 passengers and completes one 34.7-second workshop visit. Headless cost was 0.277 ms/tick on an Apple M4 Max while regression tests were also running. Accounts reconcile to $528,735 cash, $132,930 revenue and $29,195 operating expenses. This is a headless measurement, not a GPU claim.
- Final acceptance on 11 September 2026: **91/91 tests pass** (88.3 seconds with the benchmark running concurrently); **typecheck, lint and production build pass**. The production build retains its existing bundle-size warning.

## Acceptance boundaries

Browser interaction, screenshot review, mobile visual acceptance and GPU/frame-time profiling were not performed in this session. The Sites skill requires explicit browser-testing authorization, which was not part of this request. These checks remain open; compilation and headless geometry checks do not certify visual quality. The existing optional WebMCP surface has no supported browser validation context in this session and remains unverified end to end.

The service roster intentionally remains twelve stable slots. Selling retains wagons and the service; it does not remove a service slot. Tank wagons need an economy commodity and are deferred, as allowed by the roadmap. Punitive breakdown modes, arbitrary tunnel portal authoring and full steam thermodynamics are outside the implemented forgiving mode.
