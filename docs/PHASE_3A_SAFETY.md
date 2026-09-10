# Phase 3A implementation and acceptance

These notes record the `ba7eccf` milestone. The subsequent [expanded valley](EXPANDED_VALLEY.md) replaces dead-end platform departures with locomotive-leading return loops, adds a larger map and central platform, and uses v5 saves. The audit fixtures and safety invariants remain in the regression suite.

The starting revision is `aedde16`; its runtime is the audited `b1c2d05`.
The compressed fixtures in `lib/railway/fixtures` preserve the exact initial
state and the main/loop collision at 32.65 seconds before runtime changes.

## Implementation plan

1. Define model envelopes and an independent standing/swept collision detector.
   Restore simultaneous twelve-service progress coverage alongside isolated tests.
2. Introduce physical station sidings, explicit running-line ports and sampled
   turnout movements. Keep ordered service calls separate from operational paths.
   Stage new trains in an explicit off-network depot queue until a berth is safe.
3. Derive conflicts and fouling intervals from geometry. Reserve a destination
   berth and route blocks atomically; acquire contiguous junction movements up to
   the next full-consist holding point, braking before the ungranted boundary.
   Release only after the final vehicle clears. Check proposed poses independently.
4. Add occupancy-aware alternate routing with deterministic fairness and bounded
   retry, physical double-track/crossover construction, safe commands and diagnosis.
5. Version saves; rebuild derived geometry, validate detached candidates including
   physical positions and authority, and reject incompatible legacy positions
   atomically. Preserve original browser slots and service intent during recovery.
6. Integrate shared poses/paths into rendering and the dispatcher. Run the safety,
   sustained-progress, disruption, model-dimension, persistence and construction
   regressions, typecheck, lint and production build. Record measured simulation
   cost separately from browser/scene performance.

The improvement over the audited approach is to make station storage physical and
reserve a reachable berth before departure. This removes trains waiting for their
next block while occupying the shared station throat. Geometry-derived local
interlocking can then permit independent main/loop movements without a blanket
corridor lock. A separate swept detector remains the final safety backstop.

Browser interaction/visual acceptance requires explicit browser-testing
authorization under the active Sites environment. Simulation measurements do not
replace that evidence or the outstanding Phase 0 hardware baseline.

## Evidence

Runtime implementation and automated evidence are recorded below. Visual/browser and independent-review acceptance remain open.

## Delivered design

- `safety.ts` owns the locomotive, tender and wagon envelopes, including the
  widest procedural variant and all three showcase LODs. Geometry, animation,
  braking and occupancy share scene units; `units.ts` converts to displayed
  metres and km/h. Construction prices retain their original per-scene-unit
  rates. Coupling contact is allowed within a consist; inter-train contact is not.
- `topology.ts` derives named running-line ports, separate 45-unit platform
  paths, sampled turnout connections and controlled crossover paths. Each
  starter station has three physical sidings; one additional siding can be
  purchased. Yard placement checks full-length storage against track and other
  yards. The ground mesh extends underneath those yards; buildable coordinates,
  towns and fleet size stay the same.
- Turnouts use cubic paths only when their measured radius is at least six
  units. Otherwise the shortest tangent-connected circle/straight/circle path
  provides that minimum radius, avoiding cubic cusps. Crossovers require at
  least ten units of radius. A second running line is offset eight units and
  defaults to the reverse direction; the direction controls can define either
  traffic convention. Its rail, turnout and additional bridge work is priced.
  One crossover per corridor is supported, with protected removal/refund.
- Conflict zones are derived from nearby path samples with conservative vehicle
  radius, sampling and fouling margins. Same-level unconnected crossings also
  conflict; vertical separation of at least 3.1 units permits an overpass. A
  single block protects each running edge. Junction conflicts without a
  full-consist refuge between them form one atomic movement grant; disjoint
  running lines have independent blocks.
- `traffic.ts` reserves destination storage and route blocks before departure.
  It checks projected platform capacity and simulates permissions through
  successive refuges before granting a movement. Up to four direction-compatible
  route options are considered, with a 1.75× running-distance detour cap and
  explicit purchased-track preferences retained. Transit nodes do not create
  artificial stops. Scheduled station calls remain separate from the path used.
- A 50 ms fixed tick brakes before an unavailable movement and limits speed
  before curves, including curves under the trailing vehicles. The spatial
  index checks every proposed locomotive/tender/wagon sweep before commit.
  Sweeps expand the standing oriented box by arc travel plus bounding radius
  times total angular variation across every crossed geometry knot. This
  includes rotation between ticks. Unexpected conflict retains the previous
  pose and protection and names the blocking train.
- Requests retry on common one-second boundaries. Passenger preference, bounded
  waiting/call age and the manual next-departure override determine their order;
  none bypass safety. All physical owners participate in cycle detection.
  Automatic return is limited to two successful returns per scheduled call, at 30-second
  retry intervals after a 120-second cyclic wait, and requires a protected
  bidirectional path. It preserves the original service. Manual return uses the
  same physical reversal and holds on arrival.
- Construction checks the detached alignment, including new turnout/platform
  work areas, before changing money or IDs. Active journey references prevent
  track removal or direction changes even after the rear clears an earlier leg.
  Wagon additions, reassignment and reversal retain the complete physical train.
- V4 saves carry depot/berth state, physical route progress, reservations and
  recovery/scheduling data. Restore rebuilds derived geometry and validates a
  detached candidate, including all vehicle intersections, required authority,
  release distances, braking, route connections and ordered service calls.
  V1–V3 saves fail atomically with an explicit explanation. Their browser keys
  remain untouched; there is no lossless mapping from their coincident station
  positions to the new physical sidings.
- The dispatcher draws the authoritative line/turnout/platform geometry,
  direction arrows, named reservations, selected operational route and braking
  target. Optional debug overlays include body envelopes and conflict intervals.
  Directional signals require matching route authority and downstream clearance.
  Off-network queue, station, signal wait, reroute and recovery states are exposed.

## Automated acceptance

The original Phase 2 simultaneous-fleet assertion is restored, with additional
checks rather than isolated substitutions. The suite also retains the isolated
engine/economics scenarios. The two compressed historical fixtures reproduce the
old C1 and C2 intersections before being rejected by the v4 loader.

| Evidence                                                 | Result                                                                                                                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial queue, reset, C1/C2 and rejected collision saves | Every visible vehicle is separated; rejected restore leaves the entire live save unchanged.                                                                                              |
| Full fleet, first 1,800 seconds                          | All twelve services deliver, none are held; income and deliveries reconcile.                                                                                                             |
| Continuation, 1,800–3,600 seconds                        | Every service delivers again; independent SAT checks all rendered vehicle pairs each tick. Nine trains move concurrently at peak; zero collision-backstop stops.                         |
| Held-train disruption                                    | Hold an active train at 180 s, release after 90 s; every service delivers again within the declared 1,800 s recovery window, without replacing any service or emergency collision stops. |
| Main/loop and parallel operation                         | Opposing/following, held destination, rear clearance and independent all-vehicle geometry checks; separate running-line concurrency is demonstrated on suitably long corridors.          |
| Physical crossover                                       | Follow actual lane-changing geometry, retain authority across restore, reject occupied edits, and refund unused construction exactly.                                                    |
| Fast approach and long trains                            | 1×/3×/8× braking and independent quarter-tick samples; locomotive, tender and every wagon included through loops and six-car reversals.                                                  |
| Model/layout contracts                                   | All procedural variants and wheel phases plus showcase LOD bounds fit the shared envelopes; every turnout meets the minimum curve radius.                                                |
| Commands/persistence                                     | Safe platform addition, assignment, complete-consist turn-back, original schedules, exact resumed simulation, corrupted routes/authority rejected atomically.                            |

A trial 900-second delivery window was too short for the longer physical station
approaches and the congested default timetable. The retained specification is the
original 1,800-second simultaneous run; the additional 1,800-second continuation
proves renewed delivery by every service. The measured longest completed call
gap in the 3,600-second run was about 1,535 seconds. This is a congested miniature
railway, not a promise of unconstrained throughput. Held trains and infeasible
platform/direction preferences can still require player intervention.

The opposing parallel fixture uses the longer Grand Junction–Riverside corridor.
The following fixture declares a flat 150-unit corridor, purchases its separate
running line and operates both trains through physical station approaches.
Short starter corridors can legitimately leave too little running distance
between shared throats for both locomotive noses to occupy the lines at once.
The fixtures assert actual simultaneous movement and geometric separation; they
do not infer capacity from different reservation names.

## Performance and remaining gates

Run `npm run benchmark:dispatch` to reproduce the headless fleet/disruption run.
The recorded [JSON](benchmarks/phase3a.json) includes machine/runtime details,
per-service deliveries, completed call gaps, concurrency, emergency stops and
timing percentiles. On the recorded Apple M4 Max/Node 22.19 run, the 72,000 ticks
averaged 0.194 ms, with 0.452 ms at p95 and 0.621 ms at p99. This includes route
planning, interlocking and the swept backstop, and excludes rendering and the
independent test oracle. The default topology has 149 sections and 1,158 derived
conflict zones. Results are measurements, not portable performance guarantees.

Final automated checks passed: **55/55 regression tests**, TypeScript, lint,
production build and whitespace checks. The build retains the existing large client-chunk
warning and Vinext route-classification notice.

Browser interaction/visual checks were not performed: the active Sites skill
requires explicit browser-testing authorization and that optional request was
not answered. Initial placement, busy/loop approaches, terminal reversal,
small-screen interactions and accessibility still need that evidence. The Phase
0 browser/GPU baseline and an independent reviewer’s assessment also remain
open. Phase 4 stays gated on these remaining acceptance checks; this headless
implementation does not claim to close them.
