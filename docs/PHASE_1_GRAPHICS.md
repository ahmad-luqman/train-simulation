# Phase 1 — Graphics and atmosphere

Implementation: 9 September 2026. The Phase 0 shared-network, fixed-timestep and save migrations are separate work; this change retains the existing routes, economy and version 1 saves.

## What is implemented

- Grass, earth, exposed rock and gravel shading, continuous riverbanks, higher mountain ridges, clustered instanced forests, and fields/houses cleared against sampled curved tracks.
- A continuous 24-hour lighting cycle (12 real minutes at 1×), afternoon/sunset/night controls, matching distance fog, moon fill, exposure compensation, emissive windows and bright signals. Time follows simulation speed; pause, photo mode and hidden tabs freeze scenery and sound.
- A single river shader with moving ripples, shallow colors, shoreline foam, Fresnel sky reflection and glints. Performance mode suppresses wave, foam and glint detail. No reflection render target is allocated.
- Alpine Monarch locomotive and tender authored in Blender, with three glTF levels, wheel pivots, animated connecting rods, boiler bands, cab, coal, steps, buffers, couplers and named emitters. A missing or invalid level retains the procedural model. Late loads after scene disposal release their resources.
- A fixed 240-slot instanced smoke/steam pool (one draw call), effort-dependent exhaust, departure steam and distance-driven carriage motion.
- Reusable station and warehouse kits, Grand Junction clock-tower station, coal headframe, timber yard, grain silos, factories, cranes and passenger-town spires; existing bridge decks, railings, braces and piers are batched with other static scenery.
- Gesture-started Web Audio synthesis: spatial exhaust, wheel clatter, departure/manual whistle, bridge resonance and quiet wind. Master, effects and ambience controls. No external recordings or media requests.
- Smoothed follow camera, preserved apparent scale across projections, terrain floor clearance, trackside camera and photo mode with PNG export. Photo mode freezes the railway and hides the management interface; Escape returns to the overview.
- Screen-space label overlap rejection, opaque readable label plates, route highlights and selection rings that remain legible at night.

## Asset workflow

Editable source: `assets/blender/alpine-monarch.blend`. Rebuild with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-showcase.py
```

`BLENDER` may be substituted with the installed executable on another platform. Runtime files are `public/models/alpine-monarch-lod{0,1,2}.glb`. Sources are kept out of the public directory. Units are meters; runtime orientation is +Y up / -Z forward. Wheel axles use X. Engine and tender have separate origins on the track centerline. `wheel_*` empty nodes are pivots, `rod_*` nodes are translated crank rods, and couplers/emitters are named anchors. Static pieces are joined by material in Blender; editable LOD collections are retained. All materials are embedded PBR factors, with no textures to fetch or decompress. KTX2 is unnecessary for this first texture-free asset.

LOD selection accounts for orthographic zoom: close detail below effective distance 55, medium below 120, distant beyond. Performance mode forces the lowest level. All three files must load and satisfy the contract before replacement. Asset tests load the actual GLBs through Three.js GLTFLoader and check dimensions, pivots, emitters and decreasing complexity.

## Quality and resource budget

| Preset      | Pixel ratio cap | Shadow map | Active particle cap | River                                 |
| ----------- | --------------- | ---------- | ------------------- | ------------------------------------- |
| Performance | 1               | Off        | 64                  | Shallow color + simple sky reflection |
| Balanced    | 1.5             | 2048²      | 144                 | Ripples, foam, reflection, glints     |
| High        | 2               | 4096²      | 240                 | Ripples, foam, reflection, glints     |

Static scenery is merged per material; forests, sleepers and particles are instanced. Removed wagons release their own geometry. A resource ledger also owns detached procedural meshes and inactive showcase levels. Scene teardown releases those resources, lights/shadow maps, controls, labels, animation frames and the AudioContext. Model failures release partial successes.

The roadmap does not yet contain a measured Phase 0 baseline, selected device matrix or agreed performance limit. Consequently this implementation does **not** claim compliance with an existing frame-time budget. Full-scene reflections, volumetric clouds, ambient occlusion, bloom and depth of field are intentionally omitted pending that budget. The public `RailwayWorld.diagnostics` getter exposes FPS, draw calls, triangles, retained GPU geometries/textures, active particles, preset and showcase status for measurement.

## Verification

`npm test` includes simulation regressions plus actual GLB import/contract validation, partial-load cleanup, particle cap/pause checks, and daylight/river geometry checks. TypeScript, lint and the production build must also pass.

Browser acceptance remains separate from code checks. Required scenes: overview, Alpine Monarch close follow in both projections, river bridge crossing, Grand Junction, afternoon/sunset/night, every preset, mobile layout, photo export, sound after a gesture, failed model request, and repeated scene teardown. Browser checks are pending explicit authorization; no screenshots, frame-time results or device claims are fabricated here.
