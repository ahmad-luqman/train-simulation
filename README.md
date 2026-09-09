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
npm run typecheck  # TypeScript
npm run lint       # App code; generated component catalog is excluded
npm run build      # Production Cloudflare Worker + client bundle
npm start          # Preview the production Worker locally
```

## Play

- Select any of twelve steam locomotives from the roster or click its model.
- Choose **3D** for orbit controls or **Iso** for an orthographic view.
- **Follow train** follows the selected locomotive in either mode.
- Drag to pan in Iso; drag to orbit and right-drag to pan in 3D. Scroll or pinch to zoom.
- Use **Hold / Release** to dispatch individual trains. Signals protect occupied corridors.
- Passenger and freight deliveries earn money. Spend $8,500 on an additional wagon at a station while operating forward, up to six cars per train. The longer consist needs a clear approach.
- **Save / Load** stores one railway on the current browser and device. **New railway** resets the active simulation while preserving the saved game.
- Change simulation speed, graphics quality, and city labels from the visible controls. **Atmosphere** opens the continuous day/night cycle, time presets, and gesture-started spatial audio with three volume controls.
- **Trackside** watches the selected train pass. **Photo** freezes the railway and hides the interface; **Save image** exports a PNG. Escape returns to the map overview.
- **Build & route** opens the railway office. Pick a start and click the plan or valley for the endpoint; adjust the bend, review the itemized quote, then purchase. New endpoints may include a named station.
- Build sidings or a left/right passing-loop preset; the **Infrastructure** tab adds stations/platforms and offers protected demolition or refund undo for unused work.
- In **Services**, use **Stop at next station**, begin the ordered stop list at that station, set dwell, inspect the proposed itinerary, and assign it. Release the train to operate. Select a purchased track to explicitly route through a new branch or loop.
- **Dispatcher** shows physical block occupancy, turnout/platform reservations, named queues, circular waits, on-time departures and calls per minute. Select a train to set passenger/freight priority, departure slots, headway and preferred platforms. **Dispatch next** grants the next safe departure; it preserves signal protection.
- For a circular wait, release held trains, select a free parallel track before departure, or **Turn back to previous station**. Turning back preserves vehicle positions, installs a recovery shuttle and holds at the previous station for reassignment. Additional platforms and passing loops can improve capacity.
- Track direction controls accept changes only after the complete train clears. The route planner respects one-way tracks.
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

Eight towns connect through thirteen curved rail corridors. Procedural geometry supplies terrain, forests, houses, factories, stations, farms, signals, a winding river, bridge decks, locomotives, tenders, and coaches. Wheel animation and fading smoke run in Three.js. Forests and sleepers use instanced meshes; low graphics mode reduces resolution and disables shadows.

The simulation uses fixed 50 ms ticks, one block per physical edge, shared endpoint turnouts, individual platforms, configurable loading dwell, cargo deliveries, and treasury accounting. Reservations last until the rear clears. Acceleration, load-dependent mass, grade resistance, curve limits and braking envelopes determine actual speed; one scene unit represents 50/9 metres for motion and km/h display. Player-built geometry and exact service itineraries share a renderer-independent network model. This remains a miniature railway sandbox: stations use logical platforms and conservative shared throats, and trains stop at every edge boundary. Passing loops now have independent blocks. Twelve simultaneous services on the original single-platform stations can form circular waits; use the dispatcher to recover and improve the railway. Tunnels, arbitrary mid-track turnouts, multiplayer, derailments and realistic steam thermodynamics are outside this phase. Wagons increase cargo capacity and reduce speed.

The Alpine Monarch showcase locomotive and tender use three embedded-material GLB detail levels exported from the editable Blender source in `assets/blender`. The rest of the fleet and locomotive portraits remain procedural. Missing showcase assets fall back to the procedural locomotive. No external image assets or audio recordings are required.

## Code map

- `lib/railway/data.ts`: cities, corridors, and locomotive definitions.
- `lib/railway/network.ts`, `terrain.ts`: stable network records, shared sampled geometry, costs, clearance and route planning.
- `lib/railway/simulation.ts`: fixed ticks, construction commands, services, economics, resource ownership, undo and validated version 3 saves.
- `lib/railway/dispatch.ts`: motion scale, consist dimensions, traction/braking, route-history positioning, schedules and circular-wait detection.
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

Tests exercise connected routes, long-running progress for every locomotive, exclusive full-consist reservations, braking at 8×, mass and grade effects, pause/hold, capacity purchases, geometry compatibility, transactional construction/undo, bridge validation, opposing trains on a purchased passing loop, ordered calls, schedules, priorities, platform queues, in-place terminal reversal, circular-wait recovery, versions 1/2 migration and invalid-save atomicity. The app can be compiled and checked without a GPU. Visual rendering and browser interactions still require a WebGL 2-capable browser with hardware acceleration.

Optional WebMCP tools (`get_railway_state`, `follow_train`, `set_train_hold`) are registered only when `document.modelContext` is available. No supported browser validation context was available during this implementation, so these experimental integrations have not been verified end to end. Unsupported browsers run the normal interface unchanged.

Version 3 saves use a separate browser key; Load tries versions 3, 2, then 1, and migration never overwrites the older slots. New railway preserves all saved slots. Legacy saves have no actual route history: migrated consists start with their current approach and zero velocity. Legacy positions with conflicting turnout occupancy fail atomically rather than removing safety protection.

See [Phase 3 dispatch notes](docs/PHASE_3_DISPATCH.md) for the implementation plan, operating rules, regression coverage and remaining browser/performance checks.

See [Phase 2 construction notes](docs/PHASE_2_CONSTRUCTION.md) for the implementation plan, limits, and verification.

See [Phase 1 graphics notes](docs/PHASE_1_GRAPHICS.md) for asset rebuilding, preset budgets and verification status.

## Development roadmap

See [the advanced game development roadmap](docs/ADVANCED_GAME_ROADMAP.md) for the phased graphics, construction, dispatch, economy, fleet, and campaign plan, including milestones and acceptance criteria.
