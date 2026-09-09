# Phase 3 collision and routing audit

**Audited revision:** `b1c2d05` — `feat: implement Phase 3 train movement and dispatch`
**Audit date:** 10 September 2026
**Scope:** Source review and deterministic simulation reproductions. This pass changes documentation only; it does not repair the runtime. No browser/WebGL inspection was performed.

## Conclusion

Phase 3 is **partially implemented, with collision safety and automatic routing acceptance failed**. Unique block, junction and platform ownership is implemented, but it is not a proof that the rendered vehicles occupy disjoint space. The current code has no independent vehicle collision detector or movement sweep. Automatic dispatch waits for the assigned next leg; it does not plan a conflict-free route to a safe holding point or automatically resolve a feasible network deadlock.

The earlier completion claim was too broad. The 39 passing tests establish useful individual behaviors, but do not establish physical anti-collision behavior or full-fleet progress. In particular, replacing the original concurrent fleet progress test with isolated services weakened regression coverage. This is a defect to correct, not an acceptance criterion to redefine as normal congestion.

Phase 3A in [the roadmap](ADVANCED_GAME_ROADMAP.md#phase-3a--collision-safety-and-automatic-routing-corrective-milestone) is now the next required milestone. Phase 4 implementation is gated on its acceptance.

## Findings

| ID  | Priority | Finding and evidence                                                                                                                                                                                                                                                                                                                                                                                                                              | Required correction                                                                                                                                                                                                                                                   |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | P0       | Overlapping initial trains. `Simulation.trains` starts every service at distance zero without occupancy. Ouray (0), Copper Creek (3), Iron Horse (8), and Alpine Monarch (10) all have locomotive position `(-63, 0.36, -22)`. Initial reservation count is zero. `RailwayWorld.animate` positions and renders every locomotive and tender/wagon; “staged” is not a physical separation mechanism.                                                | Represent initial storage explicitly with separate berths/approaches, or an explicit off-network depot queue with a protected physical entry. Every visible train must occupy reserved, non-overlapping space before the first tick.                                  |
| C2  | P0       | Reproduced chassis overlap between active services on different tracks despite unique resource IDs. The main/loop fixture below has Commodore Vanderbilt (1) at Pinecrest and Royal Meridian (7) braking toward it. At 32.65 s their actual procedural chassis rectangles intersect. The latter reports `At signal`, with train 1 owning `junction:2`.                                                                                            | Derive movement conflict zones and stop positions from vehicle extents and track geometry. Add a separate collision backstop before committing movement. A red signal must keep the entire approaching vehicle outside the conflicting envelope.                      |
| C3  | P0       | No shared physical envelope contract. `consistLength()` estimates a trailing length; `pathPosition()` returns a position/tangent. Neither accounts for the full width, forward overhang, each vehicle's swept volume, or overlap with another consist. `moveTrain()` integrates distance without comparing vehicle shapes. `TURNOUT_CLEARANCE = 2` is a constant rather than a clearance derived from the movement geometry and model dimensions. | Define locomotive, tender and wagon envelopes, coupling offsets, front/rear bounds, vertical clearance and safety margin independently of render meshes. Check procedural and GLB assets against those envelopes.                                                     |
| C4  | P0       | Logical platform IDs do not imply separate track. `addStation()` appends platform identifiers; `vehiclePosition()` reads service edges/history and never the assigned platform. Two different platform reservations can therefore refer to the same physical station throat. Construction clearance skips matching main/loop checks and a 12-unit region around shared nodes. These exclusions are not replaced by geometric interlocking.        | Model platform berths, approach/departure paths, fouling points (where adjacent movements cease to be safely separated), and movement conflicts. Keep incompatible movements locked even when their edge or platform IDs differ.                                      |
| N1  | P1       | Parallel-track topology is incomplete. A loop is a second edge sharing its parent endpoints; there are no explicit turnout ports, crossover movements or platform approach paths. `shortestPath()` assumes any incident edges connect at a shared node, while dispatch uses one junction resource for that node. This can model neither a legal lane change nor concurrent non-conflicting junction movements precisely.                          | Add physical double-track corridors, directional running lines, permitted turnout/crossover connections and geometry-derived movement conflicts. Bind platform assignments and operational routes to those paths.                                                     |
| R1  | P0       | Default fleet fails sustained progress. After 36,000 ticks at 0.05 s (1,800 simulated seconds), trains 4, 7, 9, 10 and 11 have delivered nothing. Trains 3 and 6 form a circular platform wait; other trains queue behind them.                                                                                                                                                                                                                   | Restore a concurrent-fleet progress gate and design safe admission, holding and routing so the default feasible scenario runs without repeated manual rescue. Distinguish infeasible capacity from a preventable scheduling deadlock.                                 |
| R2  | P1       | Routing is static. `shortestPath()` uses edge length, a preferred-edge discount and direction restrictions. It has no occupancy, reservation horizon, platform clearance, braking or capacity information. `entryReason()` checks the next edge/source junction/destination platform; the destination junction is requested later. This permits entering a route whose exit may remain blocked.                                                   | Separate service intent from the operational itinerary. Plan and atomically reserve a movement to a reachable safe holding point; evaluate legal alternate paths/passing loops and protected stopping distances. Bound replanning and prevent oscillation/starvation. |
| R3  | P1       | Recovery is diagnostic/manual. `circularWaits()` follows the one reported blocker per train. `useParallel()` edits only the next leg after an explicit command. `turnBack()` replaces the service with a recovery shuttle and holds at the previous station. The recovery test proves another call by that train, not restoration of throughput across the fleet.                                                                                 | Track all blocking dependencies and avoid cycles before granting movements where possible. When recovery is needed, choose a feasible protected plan that preserves scheduled stops and demonstrate resumed fleet progress. Keep manual controls as safe overrides.   |
| P1  | P0       | Physically overlapping saves load successfully. Both the initial overlapping state and the C2 collision state pass `restore()`. `validateMotion()` checks resource names/owners, history, scalar distances and selected clearance conditions, but never inter-train physical separation.                                                                                                                                                          | Validate physical positions and occupied swept/standing envelopes on the detached restore candidate; reconstruct the interlocking consistently. Reject incompatible states atomically with an explanation; never silently teleport or discard occupied protection.    |
| T1  | P0       | Tests miss the observed defects. The Phase 2 all-twelve-trains/1,800-second assertion was replaced in `simulation.test.ts` by twelve 400-second runs with all other trains held. The loop test asserts resource uniqueness and calls, not geometry. The reversal helper samples four offsets even for six-car saves, omitting some rendered vehicles. No swept collision assertion checks the intervals between ticks.                            | Restore full-fleet coverage alongside isolated tests. Add independent geometric assertions for every rendered vehicle, including the tender and final wagon, at startup and throughout movement, reversal, edits, holds and load.                                     |

P0 findings block acceptance of collision safety and dispatch reliability. P1 topology and routing work is also required to finish the corrective milestone; it must not be postponed behind the economy.

## Reproductions and observed results

Run commands from the repository root using the installed `tsx`. These are audit probes, not new passing regression tests.

### Initial overlap, stalled fleet and accepted save

```sh
node_modules/.bin/tsx -e '
import { Simulation } from "./lib/railway/simulation.ts";
const s = new Simulation();
console.log("initial", [0,3,8,10].map(id => ({
  id, position: s.vehiclePosition(s.trains[id],0).p
})), "reservations", s.dispatch.reservations.length);
const restored = new Simulation();
restored.restore(s.save());
console.log("overlapping initial save accepted");
for (let i=0; i<36000; i++) s.step(0.05);
console.log("delivered", s.trains.map(t => [t.id,t.delivered]));
console.log("cycles", s.dispatcherSnapshot().cycles);
'
```

Observed delivery counts by train ID:

| ID                   | 0   | 1   | 2   | 3   | 4   | 5   | 6   | 7   | 8   | 9   | 10  | 11  |
| -------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Delivered at 1,800 s | 33  | 37  | 41  | 45  | 0   | 33  | 37  | 0   | 45  | 0   | 0   | 0   |

The reported circular wait is `[[3, 6]]` (Copper Creek and Timberline).

### Main/loop chassis collision

Fixture: use the existing `1-2` corridor, build its `bend: -12` passing loop, and add one platform at each end. Both trains already start at node 1. All other trains are held. Service 1 uses the loop; service 7 uses the main line. Set a one-second dwell, make both departures due at zero, and ask train 7 to stop at its next station. These direct fixture assignments eliminate unrelated dispatch timing; they do not place a moving train mid-track.

```sh
node_modules/.bin/tsx -e '
import { Simulation } from "./lib/railway/simulation.ts";
import { planService } from "./lib/railway/network.ts";
const s = new Simulation();
s.trains.forEach(t => t.held = true);
const loop = s.build({start:1,end:2,bend:-12,kind:"loop",parent:"1-2"});
s.addStation(1,"Extra"); s.addStation(2,"Extra");
for (const [id,edge] of [[1,loop],[7,"1-2"]] as const) {
  s.services[id] = planService(s.network,id,"Audit shuttle",[1,2],1,[edge]);
  s.trains[id].held=false;
  s.trains[id].dwell=0;
  s.trains[id].motion.departureDue=0;
}
s.trains[7].stopAtStation=true;
for (let i=0;i<653;i++) s.step(0.05);
console.log("poses", [1,7].map(id => ({id,...s.vehiclePosition(s.trains[id],0)})));
console.log("states", [1,7].map(id => ({id,status:s.trains[id].status,wait:s.trains[id].motion.wait})));
console.log("reservations", s.dispatch.reservations);
new Simulation().restore(s.save());
console.log("collision-state save accepted");
'
```

At 32.65 s (rounded), the chassis data are:

| Train                   | Chassis centre x | Chassis centre y | Chassis centre z | Y rotation (rad) |
| ----------------------- | ---------------- | ---------------- | ---------------- | ---------------- |
| 1, Commodore Vanderbilt | 30.000000        | 0.88             | -54.000000       | -2.352957        |
| 7, Royal Meridian       | 26.699619        | 0.88             | -53.551137       | -1.421584        |

Both are procedural locomotives. Their chassis are actual solid boxes from `models.ts`: width 1.45, height 0.25, length 3.8, centred locally at `(0, 0.52, 0)`. An oriented-rectangle separating-axis check on the four local horizontal axes reports intersection; their vertical intervals are identical. This checks actual chassis boxes, not oversized scene bounding boxes or an assumed train radius. The renderer applies these same positions and Y rotations. Browser confirmation is still pending.

For an independently reproducible intersection check, let a body's horizontal axes be `u=(cos(angle),-sin(angle))`, `v=(sin(angle),cos(angle))`. On each axis `q` from both bodies, its projected half-extent is `0.725*abs(dot(u,q)) + 1.9*abs(dot(v,q))`. The boxes overlap when, on all four axes, `abs(dot(centreB-centreA,q))` is smaller than the sum of the two half-extents. The fixture satisfies this condition; the smallest projected overlap is approximately 0.03769 scene units, so this is penetration rather than just touching.

All five reservations are unique: `block:track-1`, `platform:platform-2`, `block:1-2`, `platform:platform-9`, and `junction:2`. Train 1 owns the junction. Train 7 is braking at approximately 1.504 scene units/s and reports `At signal`. Valid logical ownership therefore coexists with physical collision.

## What the audit does and does not establish

- Confirmed: coincident initial positions, the deterministic main/loop chassis intersection, acceptance of these overlapping saves, the default-fleet stall, static routing and the coverage reduction.
- Source-level gap: arbitrary crossings, tight curves, wagon overhangs, multi-vehicle swept clearance, safe route-horizon planning and complete blocking dependencies lack dedicated safety machinery. This audit does not claim to have reproduced a collision in every such case.
- A 120-second scan of active procedural chassis in the unmodified default timetable found no additional active-versus-active chassis intersection. It excluded the showcase engine and initial staged vehicles and does not invalidate the confirmed startup and loop failures.
- All 39 existing regression tests pass at the audited revision. A passing test count is retained as a historical result, not used as a safety certificate.
- No runtime files, tests, network records or saved games were changed by this documentation pass. Temporary audit probes ran outside the repository. No new build or visual acceptance claim is made.

## Follow-up acceptance

Use the work packages, invariant tests and integration gates in Phase 3A of the roadmap. Keep these reproductions as failing fixtures before implementing fixes. Close each finding only with the relevant automated invariant, a recorded full-fleet run, and browser evidence for the affected visual behavior. Leave safety limitations visible in the Phase 3 notes until that evidence exists.
