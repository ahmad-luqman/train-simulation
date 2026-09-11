# Steam Atlas advanced game development roadmap

**Purpose:** Turn the current railway sandbox into a visually rich management game with meaningful construction, dispatch, economic, and fleet decisions.
**Baseline:** Current repository at `315b7fb`, reviewed 9 September 2026.
**Status:** Phases 1–3 and the corrective **Phase 3A implementation are delivered**, followed by the requested [expanded valley and locomotive-leading station redesign](EXPANDED_VALLEY.md). [Phase 3A safety notes](PHASE_3A_SAFETY.md) record the plan, physical topology, automated acceptance and measured headless performance. The [audit of `b1c2d05`](PHASE_3_COLLISION_AUDIT.md) remains preserved as regression evidence. All twelve services deliver in the 1,800-second run and continue through a second 1,800-second window. **Phase 4 runtime implementation is delivered:** finite inventories, three supply chains, compatible freight wagons, operating accounts, contracts, financing and version 6 saves. See [Phase 4 plan and evidence](PHASE_4_ECONOMY.md). The user explicitly requested Phase 4 implementation on 10 September 2026; browser/visual acceptance, independent review and the Phase 0 GPU baseline remain open and are not certified by the automated results. **Phase 5 runtime implementation is delivered**, including the expanded mountain railway. See [Phase 5 implementation and evidence](PHASE_5_FLEET.md). **Phase 6 runtime implementation is delivered:** guided campaign, real-action tutorial, milestone research, supply-led growth, deterministic weather/events, four scenarios, achievements, results and v8 saves. See [Phase 6 plan and verification](PHASE_6_REGION.md). **Phase 7 runtime hardening is implemented:** transactional multi-slot saves, rotating autosaves, portable files, recovery, reduced motion, keyboard/focus/touch improvements, renderer recovery and bounded performance reporting. See [Phase 7 implementation and acceptance](PHASE_7_RELEASE.md). The [authorized Chrome walkthrough](qa/phase7/README.md) covers initial desktop/mobile layouts, tutorial operation, real storage/downloads and graphics recovery, with eight groups of fixes. Remaining browser/GPU matrix, first-time-player balancing and independent-review gates remain open; this is not a release certification.

## Recommended direction

Keep the miniature railway identity and the existing 3D and isometric cameras. Make the valley more convincing at both map scale and train-follow distance, then give the player reasons to build, watch, diagnose, and improve the railway.

The main game loop should become:

**Find demand → build a connection → configure a service → deliver cargo → diagnose a bottleneck → reinvest.**

Ship a visible improvement early, then build a complete management loop before expanding the map or adding large amounts of content. Keep a free sandbox with the existing collection and introduce a separate campaign that starts with a small railway.

### What a good session should feel like

A player discovers that Ashford needs timber, connects Pinecrest, assigns a suitable locomotive and wagons, and completes the first delivery. Traffic then backs up at a single-track crossing. A passing loop or a better timetable improves throughput. The resulting profit pays for a stronger locomotive or a station upgrade. Following that train across a bridge at sunset should be satisfying even when the player is making no changes.

## Current foundation and important gaps

The project already has twelve selectable locomotives, eight towns, thirteen curved corridors, 3D and isometric cameras, train following, procedural scenery, smoke, signals, delivery revenue, wagon purchases, and a local save slot.

The original baseline had these limitations; Phase 2 resolves network ownership and editable-network persistence as noted below:

- **Network ownership — resolved in Phase 2:** Shared sampled geometry owns track lengths and prices; services store exact edge itineraries, including parallel tracks.
- **Movement and dispatch — Phase 3A implemented:** Physical berths, running-line ports, tangent-connected turnouts and controlled crossovers share geometry with rendering. Geometry-derived interlocking, swept vehicle envelopes, protected depot admission, automatic alternate routing and bounded recovery address the audited collisions/stalls. Simultaneous full-fleet regression and disruption recovery pass; browser acceptance remains open.
- **Economy — Phase 4 implemented:** Finite source inventories and destination demand govern loading and payment. Three processors, town consumption and passenger queues conserve units; fuel, crew, maintenance, infrastructure, financing and contracts reconcile through a single cash ledger.
- **Fleet — Phase 5 implemented:** Twelve distinct traction, speed, fuel, reliability, price and upkeep profiles; wheel arrangements and freight/express silhouettes; editable ordered consists; purchase, sale, replacement, upgrades, supplies, condition, workshop construction and automatic depot transfers. Version 7 saves persist fleet state and the temporarily suspended service.
- **Presentation:** Terrain, buildings, water, and smoke are simple procedural geometry. Graphics presets mainly change resolution and shadows.
- **Persistence and verification — Phase 3A implemented:** Version 6 saves extend version 5 with inventory, manifests, contract progress and auditable finances; version 5 migrates without relocating vehicles. Saves persist the expanded map, through-platform orientation, physical queues, berths, routes and authority; detached restore validates geometry, stopping protection and service order. Versions 1–4 are explicitly rejected without mutation or relocation because their positions lack physical berth/route authority. Original browser slots remain preserved. Headless performance is recorded; GPU/browser evidence remains open.

## Phase overview

Effort is relative complexity, not a calendar commitment. Select test hardware and complete Phase 0 before estimating dates. Each phase ends with a playable, reviewed build.

| Phase | Outcome                                                 | Priority             | Depends on                  | Effort |
| ----- | ------------------------------------------------------- | -------------------- | --------------------------- | ------ |
| 0     | Stable simulation and measured baseline                 | Required             | Current game                | Medium |
| 1     | A much better looking and sounding valley               | High                 | 0                           | Large  |
| 2     | Player-built track and configurable services            | High                 | 0                           | Large  |
| 3     | Believable train movement and useful dispatch decisions | High                 | 2                           | Large  |
| 3A    | Physical collision safety and automatic safe routing    | Runtime delivered    | Initial Phase 3             | Large  |
| 4     | Supply chains, contracts, and a real operating economy  | Runtime delivered    | 2 and Phase 3A              | Large  |
| 5     | Distinct locomotives, maintenance, and depot logistics  | Runtime delivered    | 3 and 4                     | Large  |
| 6     | Campaign progression and a world that responds          | Runtime delivered    | 1, 4, and 5                 | Large  |
| 7     | Performance, usability, balancing, and release quality  | Required for release | All chosen release features | Large  |

**Milestone A — Scenic railway:** Phases 0 and 1.
**Milestone B — Playable railway tycoon:** Phases 2, 3 including corrective Phase 3A, and 4.
**Milestone C — Advanced railway game:** Phases 5, 6, and 7.

Some art production can proceed while systems are built once asset and network interfaces are stable. Integrate features in dependency order; every intermediate version must remain playable.

## Phase 0 — Stabilize the foundation

**Player benefit:** Reliable controls, recoverable saves, and consistent behavior as the game grows.

**Progress through Phase 2:** Shared network/terrain geometry, fixed 50 ms ticks, atomic construction/service commands, retained original saves and version 1 migration tests are implemented. Hidden tabs pause through the existing world lifecycle. The full module split, visual interpolation, performance baseline and browser matrix remain open.

### Work

- Extract a shared `RailNetwork` with stable IDs for nodes, edges, stations, platforms, and track geometry. Both simulation and rendering read the same curve lengths.
- Give the simulation a fixed timestep accumulator and interpolate visual positions between ticks. Define what happens when the tab is hidden; default to pausing rather than silently simulating offline earnings.
- Add a seeded random generator and explicit commands for purchases, route changes, construction, and holds. Reject invalid commands before mutating state.
- Replace index-dependent save assumptions with versioned records. Preserve the original save before migration; test the existing version 1 format and unknown-version failures.
- Separate UI panels from the scene lifecycle. Split `world.ts` by responsibility and keep simulation state independent of Three.js objects.
- Establish repeatable screenshots and performance recordings for overview, close follow, a busy junction, and a small-screen layout. Measure draw calls, frame times, particle counts, and resource estimates.
- Resolve browser console warnings and verify current controls with keyboard, pointer, and touch input.

### Done when

- The same seed and command sequence produces the same simulation results regardless of render frame rate.
- Save/load restores positions, reservations, balances, and configuration without partial changes on failure.
- Camera switching, following, pause, speed changes, purchase, save, load, and reset pass browser smoke checks.
- Baseline measurements and the selected device/browser matrix are recorded in the repository.

**Boundary:** Keep the current content and economy during this phase. Finish the shared network contract before building the editor.

## Phase 1 — Upgrade graphics and atmosphere

**Implementation:** Graphics, atmosphere, audio, showcase asset and camera controls implemented. See [implementation and verification notes](PHASE_1_GRAPHICS.md) for delivered features and remaining acceptance checks.

**Player benefit:** The world looks worth exploring, and close train-follow views reveal attractive detail.

### Work

- **Terrain:** Add blended grass, soil, rock, and gravel materials; stronger mountain silhouettes; believable riverbanks; forest clusters; and details placed with roads, fields, and track clearances in mind.
- **Lighting:** Build a continuous time-of-day cycle, atmospheric distance fog, tuned shadows, and consistent exposure. Add ambient occlusion and restrained bloom only where the measured budget permits.
- **Water:** Animate the river surface with normal detail, shallow-water color changes, shoreline foam, and a lightweight reflection treatment. Keep a simpler material on low graphics.
- **Locomotives:** Replace one showcase locomotive first with a Blender model featuring readable wheels, rods, boiler bands, cab, tender, and couplers. Validate it in both camera modes before building the rest of the fleet.
- **Motion and effects:** Pool smoke particles, vary emissions with engine effort, add steam bursts and subtle carriage movement, and stop decorative motion appropriately when paused.
- **Cities:** Create reusable station, warehouse, factory, housing, and bridge kits. Give each town a distinct silhouette and industry rather than changing only its color.
- **Audio:** Add spatial wheel clatter, steam exhaust, whistles, bridge resonance, and quiet environmental ambience. Include master, effects, and ambience controls; start sound after a user gesture.
- **Camera polish:** Smooth follow transitions, preserve scale between projections, avoid terrain clipping, and add optional trackside and photo views. Depth of field belongs in photo mode, not the default management camera.
- **Readability:** Improve label placement and hide distant overlapping labels. Keep signals, route highlights, and selection visible in every lighting preset.

### Blender asset workflow

Keep editable `.blend` sources separately from exported runtime assets. Use consistent scale, orientation, naming, wheel pivots, coupler anchors, and smoke emitters. Build three levels of detail for showcase assets and retain the procedural version as a fallback. Bake details that would otherwise require unnecessary geometry or complex materials.

Export game assets as glTF/GLB and verify materials and animation in the actual game, since Blender and glTF material capabilities differ. Use Three.js `GLTFLoader`; evaluate compressed textures with `KTX2Loader` after the first model is working. See the [Blender glTF manual](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html), [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), and [KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html).

### Done when

- A reference scene containing a train, station, forest, river, and bridge looks coherent in overview and close follow views.
- Afternoon, sunset, and night remain playable; effects do not obscure track or signals.
- Every quality preset has a tested appearance, and the Phase 0 performance budget remains within the agreed limit.
- Model load failures fall back gracefully, and repeated scene resets do not continually increase retained resources.

**Boundary:** Ship one excellent train and one excellent town kit before remaking all twelve locomotives. Defer expensive full-scene reflections and volumetric clouds.

## Phase 2 — Let the player build and route

**Implementation:** Construction, stations/platforms, sidings, passing-loop presets, exact service routing, protected removal/undo and version 2 persistence are implemented. See [implementation plan and verification](PHASE_2_CONSTRUCTION.md). Browser interaction and performance acceptance remain unverified.

**Player benefit:** The player chooses where the railway goes and which services it operates.

### Work

- Add track drawing with snapping, curve-radius limits, slope limits, clearance checks, and clear valid/invalid previews.
- Show construction cost before purchase, including track length, earthworks, bridges, and station work. Construction must commit atomically with its treasury debit.
- Add stations, platforms, sidings, and passing loops. Start with a few proven turnout shapes rather than unrestricted junction geometry.
- Automatically propose a bridge at an eligible river crossing. Reserve tunnels and extensive terrain editing for later work.
- Add a route editor with ordered stops, assigned trains, destination checks, and basic dwell settings. Display the route directly on the map.
- Add bulldoze and construction undo before a built section enters service. Block removal or modification of occupied infrastructure and show the reason.
- Include a network overlay for connectivity, gradients, construction cost, and disconnected destinations.

### Done when

- A player can construct a connection, create a service, assign a train, and see it traverse exactly the purchased track.
- Invalid curves, disconnected routes, unaffordable purchases, and edits under a train produce clear feedback without corrupting the network.
- Edited networks, stations, routes, and construction costs survive save/load.
- A planned passing loop can be built while the rest of the network continues operating safely.

**Boundary:** Keep conservative corridor reservations until Phase 3. Do not enable closer headways merely because the editor can draw more track.

## Phase 3 — Make dispatching and movement matter

**Status: initial Phase 3 defects corrected by Phase 3A.** The [historical audit](PHASE_3_COLLISION_AUDIT.md) remains reproducible from preserved fixtures. See [current implementation and acceptance](PHASE_3A_SAFETY.md); visual/browser and independent review gates remain open. Phase 4 runtime work proceeded under the user’s explicit subsequent instruction; it does not close these checks.

**Player benefit:** Congestion has understandable causes, and infrastructure or scheduling changes produce visible improvements.

### Work

- Introduce track blocks, direction rules, turnout conflicts, platform occupancy, and reservations that remain active until the **last wagon** clears the protected area.
- Add acceleration, braking distance, train mass, gradient resistance, curve speed limits, and a simple traction model. Derive displayed speed from actual movement using an explicit world-distance scale.
- Follow the full route history when positioning each wagon. Preserve coupler spacing through curves, junctions, station approaches, and reversals.
- Add platform assignment, loading dwell, scheduled departure times, minimum headway, and passenger/freight priorities.
- Surface waiting reasons such as occupied block, conflicting junction movement, unavailable platform, and departure time.
- Detect circular waits. Offer an actionable recovery such as rerouting or reserving a passing loop, without teleporting trains or silently dropping safety reservations.
- Add a dispatcher view with block occupancy, queues, punctuality, and throughput. Start with automatic dispatch and allow targeted player overrides.

### Done when

- Opposing trains use a passing loop safely, and a junction remains protected while a long consist crosses it. **Reopened:** assert physical clearance of every locomotive, tender and wagon; resource uniqueness alone does not satisfy this criterion.
- Faster trains brake before restrictive signals and do not overshoot at 8× speed. **Reopened:** the complete vehicle envelope must remain outside the conflicting movement, including during the interval between ticks.
- A blocked platform explains its queue; the player can identify and resolve a bottleneck.
- Test scenarios cover long trains, opposing movements, terminal reversal, held trains, circular waits, and save/load during a reservation.

**Boundary:** Favor understandable railway rules over a complete signalling simulator. Defer derailments and detailed cab controls.

## Phase 3A — Collision safety and automatic routing (corrective milestone)

**Implementation complete; automated gates pass.** The work packages below are the retained specification. [Implementation/evidence](PHASE_3A_SAFETY.md) and [original benchmark](benchmarks/phase3a.json) and [expanded-world benchmark](benchmarks/expanded-valley.json) describe the result and the remaining browser, independent-review and GPU checks.

**Priority:** Required physical foundation for Phase 4. **Status:** Corrective runtime implementation delivered; the historical audit is retained, and the remaining acceptance checks above stay open.
**Evidence:** [Collision and routing audit of `b1c2d05`](PHASE_3_COLLISION_AUDIT.md).
**Player benefit:** Trains never occupy the same physical space, and feasible services progress without repeated manual rescue.

Treat three requirements separately: **collision detection** checks physical occupancy and proposed movement; **collision avoidance** reserves a safe movement and brakes before conflicts; **routing reliability** ensures the dispatcher can make progress or explain why capacity is infeasible. None is a substitute for the others.

### 3A.1 — Restore failing evidence and define physical occupancy

- Preserve the initial-overlap, main/loop collision and accepted-collision-save reproductions before changing behavior. Restore the original simultaneous twelve-service progress scenario alongside the isolated engine tests; do not replace it with weaker assertions.
- Define a pure simulation contract for the locomotive, tender and every wagon: coupling positions, width/height/length, forward/rear overhang and safety margin. Express motion and construction distances explicitly so conversion cannot hide a clearance error.
- Validate every procedural and GLB detail level against these envelopes. Keep render objects out of authoritative state; both collision and drawing adapters consume the same physical pose contract.
- Represent standing occupancy as intervals on travelled track plus spatial envelopes at curves and shared geometry. Derive rear clearance from the entire consist, including reversed operation and articulation at junctions.

**Exit evidence:** fixtures fail for the current defects, every rendered vehicle has a checked envelope, and occupancy includes held trains and station dwell.

### 3A.2 — Physical parallel tracks, junction topology and station movements

- Replace implicit all-to-all routing through a shared town/endpoint node with explicit track endpoints and permitted turnout movements. Connect station platforms and depots through real approach/departure paths. A route consists of connected physical track sections and valid transitions, not just a list of towns or a different edge ID.
- Add double-track corridor construction: two separated track centre-lines with their own geometry, directions, blocks and occupancy. Offer a consistent left/right traffic convention with a clear preview. Preserve bidirectional single track and passing loops; parallel tracks need not share one corridor-wide lock.
- Add controlled turnout and crossover presets: branch entry/exit, entry/exit for a passing loop, and a crossover between parallel running lines. Explicitly represent facing/trailing connections and allowed movements. Route through a crossover only when a physical connection exists; never jump lanes at a common logical node.
- Lock turnout state for each granted movement until its complete consist clears; reject switch changes underneath trains and reserve a crossover as one complete manoeuvre.
- At a junction, reserve conflicting movements rather than blanket-locking every separate track. Build a movement conflict table from swept geometry and fouling points. Allow simultaneous trains on disjoint parallel tracks; lock crossovers, converging paths and same-level diamond crossings until the full rear clears. Vertical separation must be checked geometrically.
- Make track spacing, curve radius, turnout lead length and platform length valid for the complete fleet envelope. Curves and bridge widths must preserve separation throughout, not only at endpoints. Recheck physical conflicts in construction previews, commits and demolition.
- Price both running lines, turnout/crossover work, earthworks, station connections and bridge capacity explicitly. Building a second line must create usable physical capacity that appears in the renderer, route planner and ledger.
- Preserve stable station/service identities when introducing ports or splitting tracks at controlled turnouts. Map existing route sections to the new topology in a versioned migration; reject edits under a train and update route/reservation references transactionally. Broader freeform mid-track editing can remain deferred.
- Give each initial train a non-overlapping berth and protected approach. If using an off-network depot queue, represent it explicitly in state and UI and admit vehicles through a checked entry; do not draw several staged engines at the same coordinate or teleport an active consist to make room.
- Give platform berths and their approach/departure movements physical geometry or conservative disjoint occupancy regions that match rendering. A platform purchase must add usable safe capacity, not merely another resource identifier.
- Derive fouling points and conflict zones from adjacent tracks, turnout geometry, vehicle overhang and clearance. Include loop ends and unconnected same-level crossings; distinguish bridges with adequate vertical clearance.
- Keep the original single-block-per-edge rule until physical clearances pass. Do not enable closer headways or more parallel movement solely because identifiers differ.

**Exit evidence:** zero initial intersections; two trains travel simultaneously on separate parallel lines without a false shared-corridor lock; a lane change follows an actual crossover; occupied station and loop throats block conflicting movements; a second track or valid platform demonstrably increases safe capacity.

### 3A.3 — Add independent collision detection and safe movement commit

- Build a broad-phase spatial index, then check oriented envelopes/capsules for the actual locomotive, tender and wagons. Define permitted coupling contact within a consist separately from collisions between trains.
- Check the complete proposed movement between fixed ticks, including rotation, overhang, reversing and route transitions. Use conservative swept bounds or bounded adaptive subdivision with a documented maximum displacement/rotation; endpoint-only tests cannot certify absence of tunnelling.
- Calculate signal stop positions from the frontmost physical extent and the conflicting movement envelope. Include braking distance and integration margin. A logical `At signal` state is not sufficient if the model projects into the junction.
- Commit movement only after safety checks pass. Unexpected violations retain the last valid pose and occupied reservations and report the blocker; normal operation must use advance braking, not repeated emergency freezes.
- Apply the same checks to entry from a depot, service changes, turn-back, wagon additions, construction and save restoration. Do not repair overlap with visual offsets, repulsion, hidden active trains or deleted reservations.

**Exit evidence:** the reproduced loop collision fails before the fix and passes afterward; all vehicle pairs stay separated at 1×, 3× and 8×, including sub-tick sweeps and commanded changes.

### 3A.4 — Reserve feasible routes and prevent avoidable deadlocks

- Separate ordered service stops from the operational itinerary. Search only direction-compatible paths with enough length, platform capacity and clearance for the complete consist; account for occupied and committed future movements.
- Plan to a safe holding point with sufficient stopping/standing room and a viable exit. Atomically acquire the required blocks, turnout movements and platform/overlap protection before leaving the previous safe boundary. Keep occupied resources distinct from cancellable future reservations.
- Route over a specific running line, turnout/crossover movement and station platform approach, obeying direction and connection rules. Same-direction and opposing traffic must select an appropriate separate line when available; a physically absent crossover is never an available route.
- Evaluate passing-loop and alternate-path options before entering a conflict. Preserve ordered calls and user constraints; explain and display automatic changes. Use bounded replanning and deterministic tie-breaking to avoid route oscillation.
- Use all blocking dependencies, not only the single displayed reason, for circular-wait analysis. Check that a proposed grant does not close an avoidable resource cycle. Test the prevention policy for false deadlocks; conservative locking must not stop a feasible railway indefinitely.
- Add fairness and bounded aging without allowing priority overrides to bypass safety. Schedule automatic recovery only when its path and clearance are feasible; preserve the original service intent after recovery.
- If no feasible route exists, wait outside the conflict and explain the needed capacity or player action. Do not promise perpetual progress on an impossible network; do require it for the shipped default timetable and a declared feasible benchmark.

**Exit evidence:** default concurrent fleet progress restored; opposing services use a loop automatically; controlled disruptions recover with fleet-wide throughput, not just one extra delivery by a rescue shuttle.

### 3A.5 — Persistence and dispatcher diagnosis

- Persist physical berth/queue state, operational route and future grants where necessary; rebuild derived geometry/indexes deterministically. Version the schema if these records change the save contract.
- Validate the complete detached candidate for physical intersection, ownership and stopping/clearance consistency before restoring. Include the audit's currently accepted collision state as a rejection fixture. Define explicit atomic failure or a reviewable migration for old incompatible positions; never silently relocate trains.
- Give each running line direction-specific signals that reflect the granted route and downstream clearance, not merely whether an edge has any owner. A green aspect must agree with movement authority and physical stopping limits.
- Add a track/junction plan view with separate line selection, direction arrows, named platform approaches, turnout state and the proposed/reserved path through each junction. Distinguish the two lines without relying only on color.
- Show reserved routes, physical occupancy, conflict zones, braking targets, all relevant blockers and automatic reroute/recovery decisions. Distinguish a train awaiting admission, one stopped at a signal, and an infeasible service.
- Keep debug collision envelopes optional; the ordinary player needs a clear waiting reason and a useful action rather than internal resource identifiers alone.

**Exit evidence:** uninterrupted and restored runs match; corrupt/overlapping saves cannot partially mutate the live game; displayed blocks and braking targets agree with physical behavior.

### 3A.6 — Acceptance and regression gate

| Scenario                                          | Required assertion                                                                                                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fresh railway, reset and migrated save            | Every visible vehicle has valid, non-overlapping occupancy from the first frame; admission does not jump an active train.                                                                                                                        |
| Same-track opposing and following services        | No head-on or rear-end overlap; correct front/rear margins; priority never bypasses protection.                                                                                                                                                  |
| Separate parallel running lines                   | Opposing and same-direction trains can use distinct clear lines simultaneously; no false corridor-wide lock and no physical overlap through curves.                                                                                              |
| Crossover and branch junction                     | Lane changes use a valid physical connection. Conflicting switch movements are mutually exclusive until rear clearance; unrelated parallel movements continue.                                                                                   |
| Main and purchased passing loop                   | Test opposing and same-direction arrivals, shared exit throats, held trains, reversals and simultaneous platform demand. Assert physical separation of every vehicle.                                                                            |
| Station/platform bottleneck                       | Each assignment maps to the correct physical berth and approach; no platform or lane teleport. Held and dwelling consists retain their complete occupancy. A valid additional platform improves safe throughput without overlapping model paths. |
| Junction, curve and crossing                      | Long wagons and locomotive overhang stay outside occupied movements; unconnected same-level crossings conflict; vertically separated track only conflicts where clearance requires it.                                                           |
| Fast approach at 1×/3×/8×                         | Braking begins before the physical limit; no overlap during a tick, even when render frame rate varies.                                                                                                                                          |
| Service edit, reversal, turn-back, wagon purchase | All vehicles preserve valid poses and coupling/clearance; commands reject atomically if unsafe. Include the last wagon and showcase dimensions.                                                                                                  |
| Default twelve-service fleet                      | All twelve operate concurrently under automatic dispatch for 1,800 simulated seconds. Every service delivers and continues progressing; no permanent circular wait or hidden serialization by holding eleven trains.                             |
| Feasible congestion/disruption                    | Alternate route or loop chosen automatically; no route oscillation or starvation; fleet throughput resumes within a documented scenario bound.                                                                                                   |
| Infeasible route/capacity                         | Train waits safely outside the conflict with a specific cause and achievable remedy.                                                                                                                                                             |
| Save/load at each critical boundary               | Physical occupancy, reservations, service intent and positions match uninterrupted operation; the two audited overlapping states fail safe.                                                                                                      |

- Run physical invariants independently of reservation ownership, using every rendered vehicle. Include deterministic stress fixtures and command sequences; preserve a failing seed/reproduction when a defect is found.
- Run regression tests, typecheck, lint and production build for the corrective milestone. Record an independent review of the safety assumptions and test coverage.
- Record browser interaction and visual evidence for initial placement, the reproduced loop approach, a busy junction, terminal reversal and a small-screen dispatcher. Run this when browser testing is explicitly authorized by the active environment; keep acceptance open if it has not been performed.
- Measure collision/interlocking cost and full scene performance on the Phase 0 hardware profile before increasing train count. A stalled railway is not a valid throughput or performance benchmark.

**Completion rule:** Close C1–C4, N1, R1–R3, P1 and T1 from the audit with evidence. Phase 3 is not complete because reservations are unique, one train delivered, or all existing tests pass. The user subsequently authorized Phase 4 runtime implementation while the remaining browser/GPU and independent-review evidence stays open; those checks remain required for release acceptance.

**Boundary:** This correction does not require derailments, impact physics, a rigid-body physics engine or detailed cab controls. Correct spatial protection, understandable interlocking and feasible automatic routing are required now. Advanced depot maintenance remains in Phase 5; basic safe staging cannot be deferred there.

## Phase 4 — Add a real transport economy

**Implementation:** [Phase 4 implementation plan, rules and verification](PHASE_4_ECONOMY.md). All 75 automated tests pass, including both original full-fleet delivery windows and a separate mixed-freight conservation/progress soak.

**Entry-gate disposition:** The user explicitly directed Phase 4 implementation after the Phase 3A automated safety work. Browser/GPU and independent-review acceptance remain open. Economy work preserves the physical collision assertions and full-fleet progress gates; it does not substitute money earned for geometric safety.

**Player benefit:** Routes exist to solve demand, and profits reflect service quality and operating choices.

### Work

- Replace generated loads with inventories, production rates, storage limits, and destination demand.
- Start with a small connected economy: timber to a sawmill, grain to a mill, and coal to industry; processed goods supply towns. Preserve passengers as a distinct transport service.
- Introduce cargo-compatible wagons, loading limits, source availability, and destination acceptance. A train cannot create cargo merely by arriving.
- Calculate revenue from accepted deliveries and an explicit tariff. Add service penalties or bonuses for freshness and punctuality only where the UI explains them.
- Add fuel, crew, maintenance, and infrastructure expenses. Show revenue, expenses, net operating profit, cash, and debt as separate figures.
- Add contracts with required amounts, deadlines, rewards, and visible consequences. Begin with forgiving local contracts that teach the economy.
- Add route-level accounts, inventory overlays, demand indicators, and warnings for empty running or over-supplied destinations.
- Offer limited financing with visible repayment costs. Keep unlimited-money sandbox available.

### Done when

- One raw material chain runs from producer through processing to a consumer without creating or losing cargo incorrectly.
- Accepted deliveries, rejected cargo, purchases, expenses, and debt reconcile against an auditable ledger.
- An over-served route becomes less attractive, and a well-chosen upgrade can improve net profit.
- A player can finish a contract, miss one, and recover without restarting the entire game.

**Boundary:** Balance three supply chains and one passenger model before adding many commodities or speculative price systems.

## Phase 5 — Give the fleet distinct roles

**Runtime delivered:** See [implementation, map expansion, verification and limits](PHASE_5_FLEET.md). The original twelve-slot service model is retained through engine purchases and sales. Tank wagons await a liquid commodity. The forgiving mode is implemented; punitive breakdown modes remain optional future work. Browser interaction, visual acceptance and GPU measurements remain open.

**Player benefit:** Choosing and caring for a locomotive becomes more interesting than buying the fastest one.

### Work

- Give locomotive classes different traction, speed, fuel consumption, reliability, purchase price, and maintenance needs.
- Build corresponding visual silhouettes and wheel arrangements so a mountain freight engine looks different from an express passenger engine.
- Replace wagon counts with editable consists: coaches, boxcars, hoppers, flatbeds, and tank wagons as the supported economy requires.
- Add depots, scheduled servicing, refuelling, water stops, wear, and repair downtime. Route unsuitable trains to a depot before a service fails.
- Add purchase, sell, replace, and service reassignment flows with clear costs and compatible wagon rules.
- Make upgrades bounded tradeoffs such as greater capacity, reduced consumption, or better reliability. Avoid mandatory upgrade clicking for every train.
- In forgiving mode, use reduced performance and warnings before breakdowns. Harder modes can introduce stronger consequences.

### Done when

- A heavy train on a steep route and a light express service have different rational locomotive choices.
- Maintenance spending reduces measurable downtime or wear; neglected engines have understandable consequences.
- Replacing or servicing a locomotive preserves valid service assignments and does not duplicate cargo or reservations.
- Fleet state and depot activity survive save/load.

## Phase 6 — Build progression and a living region

**Runtime delivered:** See [implementation plan, operating rules and evidence](PHASE_6_REGION.md). All four challenges and the complete campaign pass deterministic playthroughs. Region effects remain optional in sandbox; versions 5–7 migrate to v8 without relocation. The campaign inherits the proven regional infrastructure and starts with two owned freight engines. Browser/visual acceptance and GPU measurement remain open.

**Player benefit:** The railway changes the valley, and each session has clear goals and new decisions.

### Work

- Add a guided campaign that begins with a small fleet. Use deliveries, reliable service, and regional development to unlock content; keep the full collection in sandbox.
- Build a short tutorial through real actions: select a train, construct a line, configure a service, complete a delivery, resolve congestion, and reinvest.
- Let reliably supplied towns expand their buildings, population, and demand. Bound growth so the economy and rendering workload remain controllable.
- Add a small research tree for infrastructure and locomotive eras, driven by useful milestones rather than long passive waits.
- Add weather and seasons after the economic loop is stable: fog, rain, snow, water variation, and seasonal demand. Visual conditions should have restrained, clearly explained operating effects.
- Introduce forecast disruptions such as a bridge inspection or temporary industrial demand spike. Provide warning and counterplay rather than unexplained random punishment.
- Add a compact scenario set: mountain freight, a congested junction, a river crossing expansion, and a passenger punctuality challenge.
- Add achievements and a scenario results screen showing deliveries, profit, punctuality, and the player's main bottlenecks.

### Done when

- A new player completes the tutorial and can explain the purpose of their next upgrade.
- A campaign session has a clear goal, feedback on progress, and a useful recovery path after a setback.
- Town growth visibly follows supplied demand rather than running on an unrelated timer.
- Weather, events, and progression settings are reproducible from a saved game and can be disabled in sandbox.

## Phase 7 — Make it robust and release ready

**Runtime hardening implemented; acceptance still open.** See [the implementation plan, historical migration evidence and stress results](PHASE_7_RELEASE.md). Browser device profiling and recorded player sessions must guide optimization and difficulty tuning. No speculative worker migration or extra fleet capacity was added.

**Player benefit:** The advanced game stays responsive, readable, and recoverable through long sessions.

### Work

- Profile the complete release scenario. Expand instancing, material reuse, object pooling, distance-based detail, culling, and texture compression where measurements justify them.
- Move simulation work off the main thread only if profiling shows a real bottleneck; preserve the command and snapshot interfaces established in Phase 0.
- Add multiple save slots, autosave rotation, export/import, migration fixtures, and recovery from interrupted saves or corrupt files.
- Finish touch controls, keyboard navigation, focus handling, scalable text, reduced-motion settings, and signals that do not rely on color alone.
- Balance introductory costs, profitable service choices, maintenance pressure, and difficulty presets through recorded play sessions.
- Handle context loss, asset failure, resizing, background tabs, and long pause/resume cycles gracefully.
- Run network and economy stress scenarios, long-session resource checks, and final visual review on the supported hardware matrix.

### Provisional performance targets

These are proposed engineering budgets, not measurements of the current build. Confirm the exact test devices and adjust the budgets in Phase 0. Phase 7 updates the representative scene from the obsolete proposed 24-train/eight-town profile to the implemented twelve-slot/fourteen-town map. This changes the declared workload, not the FPS targets; no 24-train performance claim is made.

| Test profile     | Scenario                                               | Proposed target                                                   |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| Balanced desktop | 1080p overview, 12 trains, 14 towns, active junctions  | Around 60 FPS with 95th-percentile frame time at or below 22 ms   |
| Low graphics     | 720p equivalent internal resolution, same simulation   | At least 30 FPS with 95th-percentile frame time at or below 40 ms |
| Close follow     | Showcase locomotive, station, smoke, and water         | Meets the chosen profile without continual asset-loading stalls   |
| Long session     | 60 minutes including construction, resets, and loading | No continuing growth in retained resources after cleanup          |
| First launch     | Compressed assets required to start playing            | Aim for 15 MB or less; load optional fleet detail later           |

Prefer readable gameplay over visual effects when a budget is exceeded. Do not expand to a much larger map or fleet until the representative scenario passes.

### Done when

- The complete tutorial and all release scenarios pass on the declared device/browser matrix.
- Old supported saves migrate, corrupt saves fail safely, and autosave recovery works.
- Performance, accessibility, economy, and visual acceptance checks have recorded results.
- A production build of the exact reviewed commit passes a final smoke test before publishing.

## Architecture and data boundaries

Keep the existing Three.js, React, and TypeScript stack. Extend it in modules rather than rewriting the whole application.

| Area             | Proposed responsibility                                        | Main records                                                                |
| ---------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Network          | Physical track geometry, connectivity, construction validation | TrackEndpoint, TrackEdge, Station, PlatformPath, TurnoutMovement, Crossover |
| Simulation clock | Fixed ticks, deterministic randomness, commands                | Clock, Seed, Command                                                        |
| Dispatch         | Safe route admission, movement permissions, automatic routing  | Block, Movement, Reservation, Service, Schedule                             |
| Physical safety  | Standing/swept occupancy, clearance and collision checks       | VehicleEnvelope, OccupancyInterval, ConflictZone, Berth                     |
| Fleet            | Locomotive performance, wagon composition, servicing           | Locomotive, Wagon, Consist, Depot                                           |
| Economy          | Inventories, production, demand, contracts, accounting         | Industry, Inventory, Cargo, Contract, LedgerEntry                           |
| Rendering        | Scene objects, asset loading, effects, camera interpolation    | Asset manifest, scene handles, quality preset                               |
| Persistence      | Save versions, migration, validation, recovery                 | Save metadata, snapshot, migration fixtures                                 |
| Interface        | Construction, route editor, inspector, dispatcher, finance     | Selected entity, tool mode, presentation state                              |

Move existing functionality gradually from `lib/railway/simulation.ts`, `lib/railway/world.ts`, and `components/railway/game.tsx` as each phase needs a boundary. Avoid a large refactor that produces no playable improvement. Renderer objects must not be serialized into saves or become authoritative for prices, route lengths, or reservations.

## Next implementation backlog

The corrective dispatch and Phases 4–6 runtime work are implemented. The remaining acceptance backlog is:

1. With explicit browser-testing authorization, record initial placement, the reproduced loop approach, busy junctions, terminal reversal and small-screen dispatcher interactions.
2. Obtain an independent review of geometry, resource-release and persistence invariants; preserve the C1/C2/P1 fixtures and the simultaneous fleet tests.
3. Record the Phase 0 browser/GPU hardware baseline and compare draw calls, frame cost and input responsiveness with the expanded physical station geometry. The headless dispatch measurements do not replace this.
4. Playtest the Phase 4 office, contract flows, wagon silhouettes, small-screen controls and version 5 migration. Review balancing using the [mixed-fleet benchmark](benchmarks/phase4-economy.json); then playtest the Phase 5 fleet office, workshop transfers and mountain follow camera.

5. Record the Phase 6 tutorial, research gates, campaign/scenario reset flow, forecasts, grown-town rendering and results at desktop and mobile sizes. The complete automated campaign and four scenario wins, plus 3,600 seconds of full-fleet region safety/progress, are recorded in [Phase 6 evidence](PHASE_6_REGION.md).

The original 1,800-second all-twelve-services test is preserved alongside isolated tests, now using finite passenger queues on the original service routes. Its cash assertion includes all ledger entries because operating expenses are real. A separate default mixed-freight test requires each of the twelve services to make calls in both windows and every processor to receive cargo, with independent all-vehicle separation every tick. Sparse freight delivery opportunities are not used to weaken the original passenger delivery gate.

The original two-way passing-loop fixture retains its simultaneous movement and three-calls-per-train assertions at 1,200 seconds. Finite load timing can safely serialize the main without needing the loop; a subsequent direction restriction explicitly requires automatic loop use and concurrent movement, still with geometric separation and restore checks.

The continuation soak adds another 1,800 seconds and requires another delivery from every service, with independent all-vehicle separation checked every tick. Physical station approaches and slow curves add real journey distance: a speculative 900-second per-call bound was not retained. No original assertion was removed to accommodate that distance. The held-train scenario declares a 1,800-second recovery window. Opposing concurrency uses the longer Riverside corridor; following concurrency uses a declared 150-unit flat corridor fixture because short starter corridors can legitimately clear one shared throat before admitting the next train. Those scenarios retain geometric separation and simultaneous-running assertions.

## Features to defer

- Multiplayer and authoritative server simulation.
- A continent-sized open world and hundreds of active trains.
- Full cab simulation, steam thermodynamics, and destructive derailments.
- Unrestricted terrain sculpting and player-authored tunnel portals. Phase 5 adds shared, terrain-derived alpine tunnel spans and portals.
- A mod marketplace or in-game asset editor before save and content formats stabilize.
- WebGPU migration unless an implemented visual requirement and compatibility testing justify it.

These can become later expansions. The core release should first make building, scheduling, delivering, and improving a railway enjoyable.

## Working and completion rules

- Keep incremental commits, following the existing repository workflow. Commit complete behavior slices with relevant tests, not partially wired controls.
- Keep this roadmap updated with phase status, finished items, newly discovered constraints, and the next playable milestone.
- A feature is complete when its player action works, its failure cases are understandable, its state survives save/load, and its graphics remain within the chosen budget. For dispatch, physical safety and concurrent-fleet progress are separate mandatory checks.
- Preserve regression strength: do not replace an all-fleet progress test with isolated trains or replace collision assertions with ownership assertions. Any acceptance change requires explicit reasoning and evidence in the roadmap, not merely a green test run.
- Run focused simulation and integration tests for changed rules, plus typecheck, lint, and production build for each milestone.
- Require browser interaction and visual checks before calling a graphics milestone complete. Compilation alone is insufficient.
- Revisit scope after each milestone using actual performance and playtesting results. Add content only when the existing systems make that content meaningful.
