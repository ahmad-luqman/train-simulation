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
- Change simulation speed, graphics quality, city labels, and afternoon/golden-hour lighting from the visible controls.
- On smaller screens, **Fleet** and the selected train button open the side panels.

| Key | Action |
| --- | --- |
| Space | Pause / resume |
| I | Switch 3D / isometric camera |
| F | Follow / unfollow selected train |
| Escape | Return to map overview |
| 1 / 2 / 3 | 1× / 3× / 8× simulation speed |

## World and simulation

Eight towns connect through thirteen curved rail corridors. Procedural geometry supplies terrain, forests, houses, factories, stations, farms, signals, a winding river, bridge decks, locomotives, tenders, and coaches. Wheel animation and fading smoke run in Three.js. Forests and sleepers use instanced meshes; low graphics mode reduces resolution and disables shadows.

The simulation uses bounded substeps, per-corridor locomotive reservations, station dwell times, cargo deliveries, and treasury accounting. Routes are predefined loops. This is a miniature railway sandbox, not an engineering-grade rail physics model: station movements and junction clearance are simplified; it does not include a track editor, custom routing, multiplayer, derailments, or realistic steam thermodynamics. Wagons increase cargo capacity and reduce speed.

The scene and locomotive portraits are generated entirely from code. No Blender files, downloaded models, or external image assets are required.

## Code map

- `lib/railway/data.ts`: cities, corridors, and locomotive definitions.
- `lib/railway/simulation.ts`: independent simulation state, economics, dispatch, and validated saves.
- `lib/railway/world.ts`: Three.js scene, track geometry, train positioning, effects, camera controls, selection, and resource cleanup.
- `lib/railway/models.ts`: procedural locomotives, wagons, and buildings.
- `lib/railway/portraits.ts`: in-memory locomotive thumbnails rendered from the same models.
- `components/railway/game.tsx`: game controls, roster, inspector, and local storage.
- `app/globals.css`: reference-inspired responsive interface.

The generated Shadcn/Base UI catalog is retained and composed by the app. Its existing lint issues are excluded from the app lint task; the generated source is unchanged. The game deliberately opts out of React Compiler because its world is an imperative simulation sampled by React, and the compiler lint pass currently crashes on that pattern.

## Validation

Simulation tests exercise connected routes, long-running progress for every locomotive, exclusive block reservations, pause/hold, capacity purchases, save restoration, and invalid-save atomicity. The app can be compiled and checked without a GPU. Visual rendering and browser interactions still require a WebGL 2-capable browser with hardware acceleration.

Optional WebMCP tools (`get_railway_state`, `follow_train`, `set_train_hold`) are registered only when `document.modelContext` is available. No supported browser validation context was available during this implementation, so these experimental integrations have not been verified end to end. Unsupported browsers run the normal interface unchanged.

## Development roadmap

See [the advanced game development roadmap](docs/ADVANCED_GAME_ROADMAP.md) for the phased graphics, construction, dispatch, economy, fleet, and campaign plan, including milestones and acceptance criteria.
