# Steam Atlas advanced game development roadmap

**Purpose:** Turn the current railway sandbox into a visually rich management game with meaningful construction, dispatch, economic, and fleet decisions.  
**Baseline:** Current repository at `315b7fb`, reviewed 9 September 2026.  
**Status:** Proposed development plan. The features below are planned work, not implemented features.

## Recommended direction

Keep the miniature railway identity and the existing 3D and isometric cameras. Make the valley more convincing at both map scale and train-follow distance, then give the player reasons to build, watch, diagnose, and improve the railway.

The main game loop should become:

**Find demand → build a connection → configure a service → deliver cargo → diagnose a bottleneck → reinvest.**

Ship a visible improvement early, then build a complete management loop before expanding the map or adding large amounts of content. Keep a free sandbox with the existing collection and introduce a separate campaign that starts with a small railway.

### What a good session should feel like

A player discovers that Ashford needs timber, connects Pinecrest, assigns a suitable locomotive and wagons, and completes the first delivery. Traffic then backs up at a single-track crossing. A passing loop or a better timetable improves throughput. The resulting profit pays for a stronger locomotive or a station upgrade. Following that train across a bridge at sunset should be satisfying even when the player is making no changes.

## Current foundation and important gaps

The project already has twelve selectable locomotives, eight towns, thirteen curved corridors, 3D and isometric cameras, train following, procedural scenery, smoke, signals, delivery revenue, wagon purchases, and a local save slot.

The next version needs to address these specific limitations:

- **Network ownership:** Routes are fixed arrays. Track lengths begin as straight-line distances in the simulation and are replaced with curve lengths by the renderer. A shared network model should own geometry and distances.
- **Movement and dispatch:** Speed is effectively constant per train. Corridor reservations protect locomotive positions, but release at arrival before accounting for the complete trailing consist. Stations and junction movements are simplified.
- **Economy:** Cargo loads are generated rather than taken from inventories. Deliveries create revenue without recurring fuel, maintenance, staff, or infrastructure costs.
- **Fleet:** Locomotives share the same underlying model design with different liveries. Wagon purchases change a count rather than a cargo-specific consist.
- **Presentation:** Terrain, buildings, water, and smoke are simple procedural geometry. Graphics presets mainly change resolution and shadows.
- **Persistence and verification:** Saves assume the current fixed roster and routes. Existing simulation tests provide a useful base, but browser interaction and performance measurements still need to be established.

## Phase overview

Effort is relative complexity, not a calendar commitment. Select test hardware and complete Phase 0 before estimating dates. Each phase ends with a playable, reviewed build.

| Phase | Outcome | Priority | Depends on | Effort |
| --- | --- | --- | --- | --- |
| 0 | Stable simulation and measured baseline | Required | Current game | Medium |
| 1 | A much better looking and sounding valley | High | 0 | Large |
| 2 | Player-built track and configurable services | High | 0 | Large |
| 3 | Believable train movement and useful dispatch decisions | High | 2 | Large |
| 4 | Supply chains, contracts, and a real operating economy | High | 2 and 3 | Large |
| 5 | Distinct locomotives, maintenance, and depot logistics | Medium | 3 and 4 | Large |
| 6 | Campaign progression and a world that responds | Medium | 1, 4, and 5 | Large |
| 7 | Performance, usability, balancing, and release quality | Required for release | All chosen release features | Large |

**Milestone A — Scenic railway:** Phases 0 and 1.  
**Milestone B — Playable railway tycoon:** Phases 2, 3, and 4.  
**Milestone C — Advanced railway game:** Phases 5, 6, and 7.

Some art production can proceed while systems are built once asset and network interfaces are stable. Integrate features in dependency order; every intermediate version must remain playable.

## Phase 0 — Stabilize the foundation

**Player benefit:** Reliable controls, recoverable saves, and consistent behavior as the game grows.

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

- Opposing trains use a passing loop safely, and a junction remains protected while a long consist crosses it.
- Faster trains brake before restrictive signals and do not overshoot at 8× speed.
- A blocked platform explains its queue; the player can identify and resolve a bottleneck.
- Test scenarios cover long trains, opposing movements, terminal reversal, held trains, circular waits, and save/load during a reservation.

**Boundary:** Favor understandable railway rules over a complete signalling simulator. Defer derailments and detailed cab controls.

## Phase 4 — Add a real transport economy

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

These are proposed engineering budgets, not measurements of the current build. Confirm the exact test devices and adjust the budgets in Phase 0.

| Test profile | Scenario | Proposed target |
| --- | --- | --- |
| Balanced desktop | 1080p overview, 24 trains, 8 towns, active junctions | Around 60 FPS with 95th-percentile frame time at or below 22 ms |
| Low graphics | 720p equivalent internal resolution, same simulation | At least 30 FPS with 95th-percentile frame time at or below 40 ms |
| Close follow | Showcase locomotive, station, smoke, and water | Meets the chosen profile without continual asset-loading stalls |
| Long session | 60 minutes including construction, resets, and loading | No continuing growth in retained resources after cleanup |
| First launch | Compressed assets required to start playing | Aim for 15 MB or less; load optional fleet detail later |

Prefer readable gameplay over visual effects when a budget is exceeded. Do not expand to a much larger map or fleet until the representative scenario passes.

### Done when

- The complete tutorial and all release scenarios pass on the declared device/browser matrix.
- Old supported saves migrate, corrupt saves fail safely, and autosave recovery works.
- Performance, accessibility, economy, and visual acceptance checks have recorded results.
- A production build of the exact reviewed commit passes a final smoke test before publishing.

## Architecture and data boundaries

Keep the existing Three.js, React, and TypeScript stack. Extend it in modules rather than rewriting the whole application.

| Area | Proposed responsibility | Main records |
| --- | --- | --- |
| Network | Shared geometry, connectivity, construction validation | Node, TrackEdge, Station, Platform, Turnout |
| Simulation clock | Fixed ticks, deterministic randomness, commands | Clock, Seed, Command |
| Dispatch | Reservations, movement permissions, route planning | Block, Reservation, Service, Schedule |
| Fleet | Locomotive performance, wagon composition, servicing | Locomotive, Wagon, Consist, Depot |
| Economy | Inventories, production, demand, contracts, accounting | Industry, Inventory, Cargo, Contract, LedgerEntry |
| Rendering | Scene objects, asset loading, effects, camera interpolation | Asset manifest, scene handles, quality preset |
| Persistence | Save versions, migration, validation, recovery | Save metadata, snapshot, migration fixtures |
| Interface | Construction, route editor, inspector, dispatcher, finance | Selected entity, tool mode, presentation state |

Move existing functionality gradually from `lib/railway/simulation.ts`, `lib/railway/world.ts`, and `components/railway/game.tsx` as each phase needs a boundary. Avoid a large refactor that produces no playable improvement. Renderer objects must not be serialized into saves or become authoritative for prices, route lengths, or reservations.

## First implementation backlog

Use these as small, independently reviewable commits for the next development pass.

1. Record the baseline scenarios, current console issues, and performance measurements.
2. Extract shared network geometry and stable identifiers; verify that simulation and rendered route lengths match.
3. Introduce fixed ticks, command validation, and deterministic tests without changing the current player controls.
4. Add save migration tests and a safe restore path for the current version 1 saves.
5. Split terrain, railway, train, and effect rendering out of `world.ts` while preserving behavior.
6. Pool smoke effects and verify resource cleanup across repeated resets.
7. Build the first improved terrain, riverbank, and lighting scene.
8. Create and integrate one Blender showcase locomotive with a procedural fallback.
9. Add train audio, label decluttering, and smooth camera transitions.
10. Review Milestone A against the baseline captures, then begin construction and service editing.

Do not start every phase at once. The first delivery should prove that the game can look substantially better while staying stable and fast enough to operate.

## Features to defer

- Multiplayer and authoritative server simulation.
- A continent-sized open world and hundreds of active trains.
- Full cab simulation, steam thermodynamics, and destructive derailments.
- Unrestricted terrain sculpting and tunnels before construction rules are reliable.
- A mod marketplace or in-game asset editor before save and content formats stabilize.
- WebGPU migration unless an implemented visual requirement and compatibility testing justify it.

These can become later expansions. The core release should first make building, scheduling, delivering, and improving a railway enjoyable.

## Working and completion rules

- Keep incremental commits, following the existing repository workflow. Commit complete behavior slices with relevant tests, not partially wired controls.
- Keep this roadmap updated with phase status, finished items, newly discovered constraints, and the next playable milestone.
- A feature is complete when its player action works, its failure cases are understandable, its state survives save/load, and its graphics remain within the chosen budget.
- Run focused simulation and integration tests for changed rules, plus typecheck, lint, and production build for each milestone.
- Require browser interaction and visual checks before calling a graphics milestone complete. Compilation alone is insufficient.
- Revisit scope after each milestone using actual performance and playtesting results. Add content only when the existing systems make that content meaningful.
