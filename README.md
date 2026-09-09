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
- Passenger and freight deliveries earn money. Spend $8,500 on an additional wagon, up to six cars per train.
- **Save / Load** stores one railway on the current browser and device. **New railway** resets the active simulation while preserving the saved game.
- Change simulation speed, graphics quality, and city labels from the visible controls. **Atmosphere** opens the continuous day/night cycle, time presets, and gesture-started spatial audio with three volume controls.
- **Trackside** watches the selected train pass. **Photo** freezes the railway and hides the interface; **Save image** exports a PNG. Escape returns to the map overview.
- **Build & route** opens the railway office. Pick a start and click the plan or valley for the endpoint; adjust the bend, review the itemized quote, then purchase. New endpoints may include a named station.
- Build sidings or a left/right passing-loop preset; the **Infrastructure** tab adds stations/platforms and offers protected demolition or refund undo for unused work.
- In **Services**, use **Stop at next station**, begin the ordered stop list at that station, set dwell, inspect the proposed itinerary, and assign it. Release the train to operate. Select a purchased track to explicitly route through a new branch or loop.
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

The simulation uses fixed 50 ms ticks, per-corridor locomotive reservations, configurable station dwell times, cargo deliveries, and treasury accounting. Player-built geometry and exact service itineraries share a renderer-independent network model. This remains a miniature railway sandbox: station movements and junction clearance are simplified; passing loops share their main corridor reservation until Phase 3. Tunnels, arbitrary mid-track turnouts, multiplayer, derailments and realistic steam thermodynamics are outside this phase. Wagons increase cargo capacity and reduce speed.

The Alpine Monarch showcase locomotive and tender use three embedded-material GLB detail levels exported from the editable Blender source in `assets/blender`. The rest of the fleet and locomotive portraits remain procedural. Missing showcase assets fall back to the procedural locomotive. No external image assets or audio recordings are required.

## Code map

- `lib/railway/data.ts`: cities, corridors, and locomotive definitions.
- `lib/railway/network.ts`, `terrain.ts`: stable network records, shared sampled geometry, costs, clearance and route planning.
- `lib/railway/simulation.ts`: fixed ticks, construction commands, services, economics, dispatch, undo and validated version 2 saves.
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

Tests exercise connected routes, long-running progress for every locomotive, exclusive block reservations, pause/hold, capacity purchases, geometry compatibility, transactional construction/undo, bridge validation, operation over purchased track, live passing-loop construction, ordered stop calls, trailing-consist removal protection, version 1 migration and invalid-save atomicity. The app can be compiled and checked without a GPU. Visual rendering and browser interactions still require a WebGL 2-capable browser with hardware acceleration.

Optional WebMCP tools (`get_railway_state`, `follow_train`, `set_train_hold`) are registered only when `document.modelContext` is available. No supported browser validation context was available during this implementation, so these experimental integrations have not been verified end to end. Unsupported browsers run the normal interface unchanged.

Version 2 saves use a separate browser key; Load can migrate a version 1 save without overwriting the original. New railway preserves both saved slots.

See [Phase 2 construction notes](docs/PHASE_2_CONSTRUCTION.md) for the implementation plan, limits, and verification.

See [Phase 1 graphics notes](docs/PHASE_1_GRAPHICS.md) for asset rebuilding, preset budgets and verification status.

## Development roadmap

See [the advanced game development roadmap](docs/ADVANCED_GAME_ROADMAP.md) for the phased graphics, construction, dispatch, economy, fleet, and campaign plan, including milestones and acceptance criteria.
