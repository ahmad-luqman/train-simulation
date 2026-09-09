# Phase 2 — Construction and services

## Implementation plan

1. Extract renderer-independent terrain and sampled track geometry into a shared network with stable node, edge, station and platform IDs. The simulation owns lengths; the renderer reads them.
2. Add transactional construction quotes, endpoint snapping, bounded curves/grades, terrain and crossing clearance, automatic bridge quantities, stations/platforms, sidings and a passing-loop preset. Preserve conservative corridor protection.
3. Store ordered stops, dwell settings and exact edge itineraries per assigned train. Validate connectivity and apply service changes only at a safe station; never teleport a moving train or silently switch a parallel track.
4. Add protected demolition and refund undo for unused construction, an auditable construction ledger, version 2 saves and atomic version 1 migration. Preserve the original browser save before migration.
5. Add a dedicated construction/service panel alongside the existing railway view: interactive network drawing, cost and validity previews, map route highlighting, connectivity/gradient/cost overlays and explicit failure feedback. Keep the established green/brass railway styling.
6. Verify geometry, purchases, routing over new track, live passing-loop construction, removal protection, migration and failed-save atomicity. Run tests, TypeScript, lint and production build; record verification limitations and commit the completed implementation.

## Design decisions

- Stable IDs and explicit edge itineraries distinguish a passing loop from the main line. Shortest-path proposals are editable before assignment and are persisted rather than recalculated while a train runs.
- Conservative shared reservation groups protect a passing loop and its parent corridor together. This phase does not introduce closer headways.
- Construction uses controlled curves between snapped endpoints, with a bend adjustment. Passing loops use a predefined offset shape between existing corridor endpoints; mid-track splitting, arbitrary turnouts, tunnels and terrain sculpting remain deferred.
- Save restoration validates a detached candidate before replacing any live state. Construction also validates again when purchased, so a stale preview cannot bypass changed occupancy or funds.

## Delivered behavior

- The original thirteen Catmull–Rom alignments retain their geometry and lengths through a pure TypeScript sampler; new curves are bounded cubic alignments. `TrackCurve` renders the purchased samples and never overwrites simulation distances.
- Drawing works in the live valley and the editor's plan. Labeled endpoint selectors and numeric coordinates provide keyboard alternatives; snapping is 5 m. New track must be 16–180 m long, remain inside the buildable valley, have at least a 10 m curve radius, and stay at or below a 4% gradient. Earthworks are limited to 2.5 m; town buildings and conflicting track alignments block construction. Forests and fields are regenerated with track clearance after a purchase.
- Quotes itemize track ($220/m), earthworks ($90 per metre of accumulated height difference), eligible bridges ($1,100/m), and station work ($12,000 per station including its first platform). Extra platforms cost $6,500, with a maximum of four. A bridge must cross between dry banks with at most 32 m of river span.
- Track/siding construction can create junctions or named stations. Passing loops have left/right fixed shapes between the existing corridor endpoints and share its reservation group. Worksite occupancy is rechecked on purchase; moving trains continue elsewhere.
- Each locomotive has an editable named service, 2–16 distinct ordered station calls, a 1–60 second dwell and a persisted closed itinerary. Intermediate transit nodes do not create unscheduled deliveries. The planner proposes a shortest route, with an explicit purchased-track preference; the complete itinerary is inspectable before assignment. Trains must be held at their current station before reassignment.
- The original railway cannot be demolished. Player-built track cannot be removed while occupied by the locomotive or trailing consist, assigned to a service, or supporting another loop. Unused purchases can be undone for their exact original cost; dependent stations, platforms and tracks must be undone in reverse dependency order. Used track can be bulldozed without refund after it is safely unassigned. Demolition retains endpoints and stations for later reconnection and marks isolated endpoints on the plan.
- The construction ledger, stable ID counters, services, positions, fixed-tick remainder, stations, platforms and used-track flags survive version 2 saves. Restore validates a detached network, geometry, station references, service connectivity, reservations and ledger/refund relationships before changing live state. Loading version 1 retains its original track distances and leaves the original browser save key untouched.
- The UI extends the existing green/brass railway styling, and the world rebuilds construction-dependent railway/scenery groups while retaining cameras, trains, audio and loaded locomotive assets.

## Verification

Automated coverage includes the existing fleet/graphics regressions plus shared geometry equivalence to the original Three.js curves, frame-rate-independent fixed ticks, transactional purchases and refunds, stale funds/occupancy failures, bridge eligibility, a train completing deliveries over exactly its purchased branch, live passing-loop construction and shared reservations, ordered scheduled calls, tail clearance, station/platform dependencies, save migration and corrupt-save atomicity.

Verification result: all 23 tests pass; TypeScript, lint, whitespace checks and the production build pass. The local development route has also returned HTTP 200. Browser/WebGL interaction, screenshots, touch usability, GPU resource measurements and performance budgets have not been verified in this pass; the Sites environment workflow allows browser testing only when explicitly requested. The existing production chunk-size warning and Vinext route-classification notice remain.

## Deliberate boundaries and next work

This implements Phase 2's controlled construction and service loop; it does not claim the pending visual/performance acceptance checks are complete. Stations still use simplified movement areas, as in the existing sandbox. Additional platforms are persistent station infrastructure; platform-specific dispatch, full-consist block signalling and closer headways belong to Phase 3. Arbitrary mid-edge splitting, freeform turnouts, tunnels and extensive terrain editing remain deferred. Network capacity is bounded at 256 endpoints and 512 tracks to keep saves and editor work bounded.

Phase 3 has an initial implementation in [the dispatch notes](PHASE_3_DISPATCH.md), but its [collision/routing audit](PHASE_3_COLLISION_AUDIT.md) reopens safety acceptance. Corrective Phase 3A must add physical parallel tracks, station approaches and junction movements before the economy. Its scope was: explicit blocks and platform reservations, physically smoother movement and bottleneck diagnostics, followed by Phase 4's operating economy. The outstanding Phase 0/1 browser and performance baseline should be completed before expanding those systems.
