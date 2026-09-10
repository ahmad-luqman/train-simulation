# Expanded valley and locomotive-leading stations

This follows Phase 3A (`ba7eccf`) and implements the request to enlarge the map,
rethink stations/tracks and address locomotives pushing normal services from the tail.

## Plan and implementation

1. Centralize the world extents and spread the existing towns apart, retaining
   vehicle dimensions, physics, service identities and the thirteen corridors.
2. Replace dead-end platform departures with continuous platform exits and real
   return loops. Share station arrival/exit throats to reduce duplicated approach
   tracks. Place station halls and canopies beside the operational platforms.
3. Preserve collision, route-authority and complete-consist recovery invariants.
   Give the central interchange additional physical capacity and ensure older
   arrivals cannot be repeatedly pre-empted by newly admitted departures.
4. Update terrain, river, scenery, shadows, camera framing, plans, construction
   bounds and persistence together. Verify full-fleet and individual operation.

`map.ts` now owns the extents. Town coordinates and their connecting corridors
span 2.4 times their previous width/depth. The buildable area grows from 172 × 145
scene units to 412.8 × 348, or **5.76 times the area**. Trains, track gauge,
platform lengths and speed conversion are unchanged. Longer tracks provide real
running distance between junctions. New construction can span up to 432 scene
units. The terrain backing, river and overview camera cover the larger world;
forests stay instanced with a bounded increase in tree candidates.

Stations have a shared arrival throat, a fan into separate 45-unit through
platforms, nested physical return arcs, and an outside return road feeding the
exit throat. Arc radii range from 16 to 28 scene units. The locomotive continues
forward out of its platform and pulls the complete consist around the loop.
Platforms have no terminal buffer across that path. Station halls and covered
waiting areas now sit beside those platforms. Grand Junction has four platforms;
the other starter stations have three. The existing platform purchase remains
available where there is room for a fourth.

All physical paths participate in the same geometry-derived conflict table,
independent swept checks, braking and full-rear release as Phase 3A. After an
active train has waited at a junction for 30 seconds, new admissions that need
its exact requested movement wait for that approach to clear. Already admitted
trains retain authority and can finish. This prevents an uninterrupted stream of
new departures from starving an older atomic arrival request; unrelated movements
can continue. Scheduling preferences do not create artificial physical owners.

## Why the engine was at the tail

The old platform was a dead-end siding. The coupled train backed out intact,
which put the locomotive at the trailing end. That was deliberate backing, not
an engine changing position. A locomotive running backward while still pulling
coaches is also a different operation from pushing the whole train from the rear.

For this steam railway, normal services now keep the locomotive leading. A
physical return loop turns the complete train without uncoupling, swapping vehicle
order or teleporting the engine. A turntable alone would only turn the locomotive;
putting it at the other end of the coaches would also require a run-around or
another explicit shunting arrangement. Whole-train backing remains available for
protected recovery. Real railways have also turned complete trains using a
[wye manoeuvre](https://www.nps.gov/places/the-train-wye.htm); this game uses a
continuous loop for normal operation.

A recovery return records which way the train occupies its platform. Resuming
normal service converts that standing pose into a forward route without changing
any vehicle position or orientation. Tests include the locomotive, tender and all
six wagons, both before/after the command and after save/load at the return berth.

## Persistence and verification

V5 saves distinguish the expanded map and new station layout. V1–V4 browser keys
remain untouched. Loading those layouts is rejected atomically with a clear
message rather than stretching old active routes or moving their trains. Start a
new railway to use the expanded world; saving writes the separate v5 slot.

The original all-twelve-services 1,800-second run and second 1,800-second
continuation remain intact, with geometric separation checked on every tick.
Both windows require delivery from every service, and normal active routes must
keep the locomotive leading. The held-train disruption keeps its 1,800-second
recovery bound. Longer individual journeys now get 900–1,200 seconds in the
isolated/repeated-call fixtures instead of old 325–600-second bounds; call counts,
separation, concurrent movement, revenue and pose assertions remain in place.

Additional layout tests verify map expansion against the preserved original
fixture, tangent-connected station paths, return loops inside terrain bounds,
repeated six-car locomotive-leading operation, physical recovery/resumption, and
atomic rejection of the old map format.

Run `npm run benchmark:dispatch` for the current headless benchmark. The recorded
[expanded-valley result](benchmarks/expanded-valley.json) covers 72,000 ticks,
per-service progress, ten simultaneously moving trains and zero emergency
collision stops, plus the held-train recovery. This measures simulation cost,
not WebGL frame rate. The original Phase 3A result is retained for comparison.

Browser interaction and visual acceptance were not performed because the active
Sites environment requires an explicit browser-testing request. The outstanding
GPU baseline and independent safety review remain open. No claim of browser or
GPU acceptance is made by the automated tests or build.

Verification passed: **60/60 tests**, TypeScript, lint and production build.
The final construction-clearance change also passed the 20-test construction
and topology subset. The build retains the existing large-chunk and Vinext
route-classification notices.
