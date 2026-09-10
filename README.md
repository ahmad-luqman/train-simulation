# Steam Atlas

A playable, single-player railway sandbox built with Three.js, React, TypeScript, and Vinext. The interface and miniature landscape take their visual direction from the supplied railway reference.

## Run locally

Requires Node.js 22.13 or later and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by the server (normally http://localhost:3000).

```sh
npm test           # Railway simulation regression tests
npm run benchmark:dispatch # Reproducible headless fleet/disruption timings
npm run benchmark:economy  # Mixed-fleet economy, contracts and account totals
npm run typecheck  # TypeScript
npm run lint       # App code; generated component catalog is excluded
npm run build      # Production Cloudflare Worker + client bundle
npm start          # Preview the production Worker locally
```

## Play

- Select any of twelve steam locomotives from the roster or click its model.
- Choose **3D** for orbit controls or **Iso** for an orthographic view.
- **Follow train** follows the selected locomotive in either mode. A queued locomotive shows **Follow when dispatched**: the camera keeps its current view until the train enters a physical berth, then follows it automatically with a smooth zoom. Trackside requires a visible locomotive.
- Drag to pan in Iso; drag to orbit and right-drag to pan in 3D. Scroll or pinch to zoom.
- Use **Hold / Release** to dispatch individual trains. Physical blocks and junction movements protect the complete consist.
- Deliver real passengers and freight into destination demand to earn the displayed tariff. Spend $8,500 on an additional wagon at a station while operating forward, up to six cars per train. Its cargo family follows the service configuration, and the longer consist needs a clear approach.
- **Economy** opens inventory and demand maps, supply-chain instructions, cargo manifests, wagon refitting, service accounts, local contracts, financing and the complete cash ledger. Coaches carry passengers; flat wagons carry timber/lumber; hoppers carry coal/grain; box wagons carry flour/goods.
- Copper Creek starts on the Coalhaven–Grand Junction coal shuttle, Golden Valley on the Millbrook–Grand Junction grain shuttle, Timberline carries timber to the Riverside sawmill and lumber onward, and Red Mesa carries processed goods from Grand Junction. Other trains run passenger services.
- Loading uses available source stock, destination demand, wagon capacity and configured dwell (12 units/second). Rejected cargo stays aboard and earns nothing until accepted. Deliver it before changing a service or refitting. Consumer stock stays in town rather than becoming another paid return load.
- Fuel, crew, maintenance and infrastructure are billed each simulation minute. **Accounts** separates revenue, expenses, operating profit, cash and debt. Borrow up to $100,000 at 0.2% interest per simulation minute, or select **Sandbox · unlimited purchasing funds**. Cash overdrafts block standard purchases but do not stop trains.
- **Contracts** start their simulation-time deadlines when accepted. Complete the stated delivery for a reward; a missed deadline charges the visible fee and allows another attempt. Pause also pauses production, bills and deadlines.
- **Save / Load** stores one railway on the current browser and device. **New railway** resets the active simulation while preserving the saved game.
- Change simulation speed, graphics quality, and city labels from the visible controls. **Atmosphere** opens the continuous day/night cycle, time presets, and gesture-started spatial audio with three volume controls.
- **Trackside** watches the selected train pass. **Photo** freezes the railway and hides the interface; **Save image** exports a PNG. Escape returns to the map overview.
- **Build & route** opens the railway office. Pick a start and click the plan or valley for the endpoint; adjust the bend, review the itemized quote, then purchase. New endpoints may include a named station.
- Build sidings, left/right passing loops, or a separated second running line; the **Infrastructure** tab adds stations/platforms adds a physical crossover to a double-track corridor, and offers protected demolition or refund undo for unused work.
- In **Services**, use **Stop at next station**, begin the ordered stop list at that station, set dwell, inspect the proposed itinerary, and assign it. Release the train to operate. Select a purchased track to explicitly route through a new branch or loop.
- **Dispatcher** shows physical block occupancy, turnout/platform reservations, named queues, circular waits, on-time departures and calls per minute. Select a train to set passenger/freight priority, departure slots, headway and preferred platforms. **Dispatch next** grants the next safe departure; it preserves signal protection.
- For a circular wait, release held trains, select a free parallel track before departure, or **Turn back to previous station**. Turning back preserves every vehicle position and the original service, then holds at the previous station. Automatic dispatch can also perform a bounded safe return for a circular wait. Additional platforms and passing loops can improve capacity.
- Track direction controls accept changes only after active journeys referencing that track finish. The route planner respects one-way tracks.
- Connectivity, gradient and construction-cost overlays appear in the plan and 3D view. Errors explain insufficient funds, clearance, occupied worksites and disconnected stops.
- On smaller screens, **Fleet** and the selected train button open the side panels.

| Key       | Action                           |
| --------- | -------------------------------- |
| Space     | Pause / resume                   |
| I         | Switch 3D / isometric camera     |
| F         | Follow / unfollow selected train |
| Escape    | Return to map overview           |
| 1 / 2 / 3 | 1× / 3× / 8× simulation speed    |

## World and simulation

Eight towns span an expanded valley with 5.76 times the previous buildable area, connected by thirteen longer curved rail corridors. Procedural geometry supplies terrain, forests, houses, factories, stations, farms, signals, a winding river, bridge decks, locomotives, tenders, and coaches. The terrain is cut beneath the physical tracks and station platforms, with blended shoulders, so expanded yards remain above ground. Construction and undo rebuild these cuts from the original terrain. Wheel animation and fading smoke run in Three.js. Forests and sleepers use instanced meshes; low graphics mode reduces resolution and disables shadows.

The simulation uses fixed 50 ms ticks, physical running lines, connected turnout paths and separate through-platform tracks. Trains wait explicitly off-network until an entire consist can enter a clear berth. Geometry-derived conflict zones, atomic route admission, full-rear clearance and an independent swept collision backstop protect movement. Shared station throats serve three through platforms per town and four at Grand Junction. Physical return loops keep the locomotive leading on normal services. Automatic routing preserves ordered service calls and explicit track preferences, considers occupied alternate routes, and reserves a reachable destination platform before departure.

Acceleration, load-dependent mass, grade resistance, curve limits and advance braking determine actual speed. Geometry and physics use the same scene units; one unit represents 50/9 metres, and displayed construction distances and speeds use that conversion. Physical station approaches add real journey time: the default railway is congested, and individual calls can take considerably longer than isolated runs. Holds retain occupied protection; impossible capacity or direction constraints require a player change. One block per running edge remains the rule. Tunnels, arbitrary mid-track turnouts, locomotive run-arounds, multiplayer and realistic steam thermodynamics remain outside this phase.

The Alpine Monarch showcase locomotive and tender use three embedded-material GLB detail levels exported from the editable Blender source in `assets/blender`. The rest of the fleet and locomotive portraits remain procedural. Missing showcase assets fall back to the procedural locomotive. No external image assets or audio recordings are required.

## Code map

- `lib/railway/data.ts`: cities, corridors, and locomotive definitions.
- `lib/railway/network.ts`, `terrain.ts`: stable network records, shared sampled geometry, costs, clearance and route planning.
- `lib/railway/simulation.ts`: fixed ticks, construction commands, services, resource ownership, undo and validated version 6 saves.
- `lib/railway/economy.ts`: finite stock, production/processing/consumption, manifests, tariffs, costs, contracts, debt and journal validation.
- `components/railway/economy-office.tsx`: supply/demand map, wagon configuration, service accounts, contracts and finance controls.
- `lib/railway/map.ts`: shared world, construction and camera extents.
- `lib/railway/topology.ts`: physical ports, shared station throats, through platforms, return loops, crossovers and geometry-derived conflicts.
- `lib/railway/traffic.ts`: route admission, movement authority, fair retries, safe recovery and physical restore validation.
- `lib/railway/safety.ts`, `model-envelope.ts`: shared vehicle envelopes, spatial index, swept collision checks and model bounds.
- `lib/railway/dispatch.ts`, `units.ts`: traction/braking, schedules, circular-wait detection and the shared distance scale.
- `components/railway/dispatcher.tsx`: live occupancy map, queues, recovery actions and timetables.
- `lib/railway/network-view.ts`: Three.js adapter that renders the authoritative track samples.
- `components/railway/network-editor.tsx`: construction, network overlays, ordered services and infrastructure ledger.
- `lib/railway/world.ts`: Three.js scene, track geometry, train positioning, effects, camera controls, selection, and resource cleanup.
- `lib/railway/models.ts`: procedural locomotives, wagons, and buildings.
- `lib/railway/atmosphere.ts`, `scenery.ts`, `town-kits.ts`: lighting, river shader, terrain and reusable city kits.
- `lib/railway/effects.ts`, `audio.ts`: pooled smoke/steam and gesture-started spatial sound.
- `lib/railway/assets.ts`: validated showcase loading, rigging and fallback cleanup.
- `lib/railway/portraits.ts`: in-memory locomotive thumbnails rendered from the same models.
- `components/railway/game.tsx`: game controls, roster, inspector, and local storage.
- `app/globals.css`: reference-inspired responsive interface.

The generated Shadcn/Base UI catalog is retained and composed by the app. Its existing lint issues are excluded from the app lint task; the generated source is unchanged. The game deliberately opts out of React Compiler because its world is an imperative simulation sampled by React, and the compiler lint pass currently crashes on that pattern.

## Validation

The corrective [Phase 3A implementation](docs/PHASE_3A_SAFETY.md) addresses the [preserved Phase 3 audit cases](docs/PHASE_3_COLLISION_AUDIT.md). Automated tests cover independent geometric separation for every vehicle, sub-tick motion at 1×/3×/8×, physical parallel/crossover movement, six-car reversal, construction, model dimensions, corrupt saves, all twelve services over 1,800 seconds plus a second 1,800-second continuation, and fleet recovery after a held-train disruption. The separate benchmark records headless simulation timings in [the current measured result](docs/benchmarks/expanded-valley.json).

A [Safari visual review](docs/EXPANDED_VALLEY.md) checked the overview and improved both track-plan panels. Sustained train/camera interaction, full WebGL visual acceptance, accessibility and the Phase 0 GPU baseline remain open. Headless tests and timings do not certify those checks.
Optional WebMCP tools (`get_railway_state`, `follow_train`, `set_train_hold`) are registered only when `document.modelContext` is available. No supported browser validation context was available during this implementation, so these experimental integrations have not been verified end to end. Unsupported browsers run the normal interface unchanged.

Version 6 saves add inventories, manifests, wagon families, production counters, contracts, debt and an auditable ledger to the expanded world and physical authority. Load searches v6, then the preserved v5/v4/v3/v2/v1 slots. Version 5 migrates with the same vehicle positions, cash and historic train totals; its generated load percentages are cleared because historic cargo had no inventory provenance. The first real manifest loads on a subsequent departure. Versions 1–4 use incompatible layouts and are rejected atomically with an explanation; no trains are silently relocated or stretched onto the larger map. Start a new railway to use this layout. New railway preserves every saved slot. Current saves restore only after detached geometry, ownership, braking and service-order validation.

See [Phase 4 economy plan and verification](docs/PHASE_4_ECONOMY.md) for the complete operating rules and acceptance evidence.

See [expanded valley and station notes](docs/EXPANDED_VALLEY.md) for the map redesign and locomotive-leading operation.

See [Phase 3A safety notes](docs/PHASE_3A_SAFETY.md) for the current implementation plan, operating rules, regression coverage and remaining acceptance checks. [Phase 3 dispatch notes](docs/PHASE_3_DISPATCH.md) preserve the earlier implementation history.

See [Phase 2 construction notes](docs/PHASE_2_CONSTRUCTION.md) for the implementation plan, limits, and verification.

See [Phase 1 graphics notes](docs/PHASE_1_GRAPHICS.md) for asset rebuilding, preset budgets and verification status.

## Development roadmap

See [the advanced game development roadmap](docs/ADVANCED_GAME_ROADMAP.md) for the phased graphics, construction, dispatch, economy, fleet, and campaign plan, including milestones and acceptance criteria.
