import { loadCargo, unloadCargo } from './economy';
import { locomotives } from './data';
import {
  advanceVelocity,
  circularWaits,
  BRAKE,
  consistLength,
  performance,
  TICK,
  type WaitReason,
} from './dispatch';
import { nodeAt, shortestPath, type RouteLeg } from './network';
import {
  BERTH_STOP,
  BERTH_LENGTH,
  type PhysicalRoute,
  type RouteInterval,
} from './topology';
import { collision, envelopes, OccupancyIndex, sweptEnvelope } from './safety';
import type { Simulation, TrainState } from './simulation';

export type PhysicalMotion = {
  queued: boolean;
  requestedCrossover?: string;
  berth?: string;
  berthReverse?: boolean;
  route?: PhysicalRoute;
  at: number;
  stopTarget: number;
  blockers: number[];
  retryAt: number;
  decision?: string;
  emergencies: number;
  recoveryAttempts: number;
  recoveryAfter: number;
  lastCallAt: number;
};
export const newPhysicalMotion = (): PhysicalMotion => ({
  queued: true,
  berthReverse: false,
  at: 0,
  stopTarget: 0,
  blockers: [],
  retryAt: 0,
  emergencies: 0,
  recoveryAttempts: 0,
  recoveryAfter: 0,
  lastCallAt: 0,
});
const FRONT = 3;
export class Traffic {
  private paths = new WeakMap<PhysicalRoute, RouteInterval[]>();
  private tickIndex = new OccupancyIndex();
  private pendingApproach?: { train: number; resources: Set<string> };
  constructor(readonly sim: Simulation) {}
  get topology() {
    return this.sim.topology;
  }
  beginTick() {
    this.tickIndex = new OccupancyIndex(this.allEnvelopes());
    // Drain only the exact movement requested by an older approaching train.
    // Already admitted trains keep their authority and can finish, avoiding a
    // stream of new departures repeatedly pre-empting one atomic arrival grant.
    const waiting = this.sim.trains
      .filter(
        (t) =>
          !t.held &&
          t.motion.physical.route &&
          t.motion.wait?.kind === 'junction' &&
          t.motion.waitingSince !== null &&
          this.sim.elapsed - t.motion.waitingSince >= 30,
      )
      .sort(
        (a, b) =>
          a.motion.physical.lastCallAt - b.motion.physical.lastCallAt ||
          a.id - b.id,
      );
    const next = waiting[0];
    this.pendingApproach = next
      ? {
          train: next.id,
          resources: new Set(
            this.group(
              next,
              next.motion.physical.route!,
              next.motion.physical.at,
            ).map((i) => i.resource),
          ),
        }
      : undefined;
  }

  visible(t: TrainState) {
    return !t.motion.physical.queued;
  }
  pose(t: TrainState, offset: number, at = t.motion.physical.at) {
    const m = t.motion,
      p = m.physical,
      behind = m.reversed ? consistLength(t.cars) - offset : offset;
    if (p.queued) {
      const n = nodeAt(this.sim.network, this.sim.endpoints(t)[0]);
      return { p: { x: n.x, y: n.y, z: n.z }, angle: 0, edge: 'depot' };
    }
    const pose = p.route
      ? this.topology.pose(p.route.sections, at - behind)
      : this.topology.pose(
          [{ section: p.berth!, reverse: p.berthReverse ?? false }],
          BERTH_STOP - behind,
        );
    if (m.reversed) pose.angle += Math.PI;
    return pose;
  }
  boxes(t: TrainState, at = t.motion.physical.at) {
    return this.visible(t)
      ? envelopes(t.id, t.cars, (o) => this.pose(t, o, at))
      : [];
  }
  allEnvelopes() {
    return this.sim.trains.flatMap((t) => this.boxes(t));
  }
  private reservation(resource: string) {
    return this.sim.dispatch.reservations.find((r) => r.resource === resource);
  }
  private claim(
    resource: string,
    t: TrainState,
    releaseAt: number | null = null,
  ) {
    const old = this.reservation(resource);
    if (old && old.owner !== t.id)
      throw new Error(`Unsafe resource grant: ${resource}`);
    if (old) old.releaseAt = releaseAt;
    else
      this.sim.dispatch.reservations.push({ resource, owner: t.id, releaseAt });
  }
  private intervals(route: PhysicalRoute) {
    let list = this.paths.get(route);
    if (!list) {
      list = this.topology.intervals(route.sections);
      this.paths.set(route, list);
    }
    return list;
  }
  private occupiedBerth(
    t: TrainState,
    berth: string,
    reverse = berth === t.motion.physical.berth
      ? (t.motion.physical.berthReverse ?? false)
      : false,
  ): RouteInterval[] {
    return this.topology
      .intervals([{ section: berth, reverse }])
      .filter(
        (i) =>
          i.end >= BERTH_STOP - consistLength(t.cars) - FRONT &&
          i.start <= BERTH_STOP + FRONT,
      );
  }
  private holdBerth(t: TrainState) {
    const b = t.motion.physical.berth!;
    this.claim(`platform:${b}`, t);
    for (const i of this.occupiedBerth(t, b)) this.claim(i.resource, t);
  }
  private blockers(t: TrainState, resources: string[]) {
    return [
      ...new Set(
        resources
          .map((r) => this.reservation(r)?.owner)
          .filter((id): id is number => id !== undefined && id !== t.id),
      ),
    ].sort((a, b) => a - b);
  }
  private wait(
    t: TrainState,
    kind: WaitReason['kind'],
    message: string,
    owners: number[] = [],
    resource?: string,
  ) {
    t.motion.wait = {
      kind,
      message,
      ...(owners.length ? { owner: owners[0] } : {}),
      ...(resource ? { resource } : {}),
    };
    t.motion.waitingSince ??= this.sim.elapsed;
    t.motion.physical.blockers = owners;
    t.status = kind === 'hold' ? 'On hold' : 'At signal';
  }
  private stage(t: TrainState) {
    const p = t.motion.physical,
      from = this.sim.endpoints(t)[0],
      station = this.sim.network.stations.find((s) => s.node === from)!;
    const all: number[] = [];
    for (const berth of station.platforms) {
      const required = [
          `platform:${berth}`,
          ...this.occupiedBerth(t, berth).map((i) => i.resource),
        ],
        owners = this.blockers(t, required);
      if (owners.length) {
        all.push(...owners);
        continue;
      }
      if (!this.feasibleAfter(t, berth, true)) continue;
      const candidate = {
        ...t,
        motion: { ...t.motion, physical: { ...p, queued: false, berth } },
      };
      if (collision([...this.allEnvelopes(), ...this.boxes(candidate)]))
        continue;
      p.queued = false;
      p.berth = berth;
      p.berthReverse = false;
      p.at = 0;
      t.motion.reversed = false;
      this.holdBerth(t);
      for (const b of this.boxes(t)) this.tickIndex.add(b);
      return true;
    }
    this.wait(
      t,
      'depot',
      `Awaiting a clear depot entry at ${station.name}. Free a platform or add capacity.`,
      [...new Set(all)],
    );
    return false;
  }
  private intended(t: TrainState) {
    const s = this.sim.services[t.id],
      legs: RouteLeg[] = [];
    let next = t.leg;
    do {
      const leg = s.legs[next];
      legs.push(leg);
      next = (next + 1) % s.legs.length;
      if (leg.stop) break;
    } while (next !== t.leg);
    return { legs, next };
  }
  private routeOptions(t: TrainState) {
    const { legs, next } = this.intended(t),
      from = legs[0].from,
      to = legs.at(-1)!.to;
    const options: RouteLeg[][] = [legs],
      network = this.sim.network;
    const pinned = this.sim.services[t.id].preferred ?? [];
    const unavailable = new Set(
      network.edges
        .filter((e) => this.blockers(t, [`block:${e.id}`]).length > 0)
        .map((e) => e.id),
    );
    const originalLength = legs.reduce(
      (n, l) => n + network.edges.find((e) => e.id === l.edge)!.length,
      0,
    );
    const add = (excluded: Set<string>) => {
      const alternative = shortestPath(
        { ...network, edges: network.edges.filter((e) => !excluded.has(e.id)) },
        from,
        to,
        pinned,
      );
      if (
        alternative &&
        alternative.reduce(
          (n, l) => n + network.edges.find((e) => e.id === l.edge)!.length,
          0,
        ) <=
          originalLength * 1.75 &&
        legs
          .filter((l) => pinned.includes(l.edge))
          .every((l) => alternative.some((a) => a.edge === l.edge)) &&
        !options.some(
          (o) =>
            o.map((l) => l.edge).join() ===
            alternative.map((l) => l.edge).join(),
        )
      )
        options.push(
          alternative.map((l, i) => ({
            ...l,
            stop: i === alternative.length - 1,
          })),
        );
    };
    add(unavailable);
    for (const leg of legs) {
      if (options.length >= 4) break;
      add(new Set([...unavailable, leg.edge]));
    }
    return { options, next, from, to };
  }
  private controls(route: PhysicalRoute) {
    return this.intervals(route).filter(
      (i) =>
        i.resource.startsWith('zone:') ||
        (i.resource.startsWith('section:') &&
          ['turnout', 'crossover'].includes(
            this.topology.sections.get(i.resource.slice(8))?.kind ?? '',
          )),
    );
  }
  private group(t: TrainState, route: PhysicalRoute, at: number) {
    const length = consistLength(t.cars),
      controls = this.controls(route).filter(
        (i) => i.end + length + FRONT > at + 1e-8,
      );
    // Consecutive conflicts without a full-consist refuge form one atomic grant.
    const horizon =
      at +
      FRONT +
      (t.motion.velocity * t.motion.velocity) / (2 * BRAKE) +
      t.motion.velocity * TICK +
      0.1;
    let end = horizon;
    const selected: RouteInterval[] = [];
    for (const i of controls) {
      if (i.start > end + 1e-8) break;
      selected.push(i);
      end = Math.max(end, i.end + length + FRONT * 2);
    }
    return selected;
  }
  private safeGrant(
    t: TrainState,
    route: PhysicalRoute,
    at: number,
    resources: string[],
  ) {
    // Simulate permissions to successive full-consist refuges. Both trains in
    // a passing loop can clear their entry throats before claiming the exits.
    const owners = new Map(
      this.sim.dispatch.reservations.map((r) => [r.resource, r.owner]),
    );
    for (const resource of resources) owners.set(resource, t.id);
    const states = this.sim.trains
      .filter((other) => other.id === t.id || other.motion.physical.route)
      .map((other) => ({
        train: other,
        route: other.id === t.id ? route : other.motion.physical.route!,
        at: other.id === t.id ? at : other.motion.physical.at,
        done: false,
      }));
    const release = (state: (typeof states)[number]) => {
      const endByResource = new Map(
        this.intervals(state.route).map((i) => [i.resource, i.end]),
      );
      if (state.route.source)
        endByResource.set(`platform:${state.route.source}`, BERTH_LENGTH);
      for (const [resource, owner] of owners)
        if (
          owner === state.train.id &&
          resource !== `platform:${state.route.destination}` &&
          state.at >=
            (endByResource.get(resource) ?? Infinity) +
              consistLength(state.train.cars) +
              FRONT -
              1e-8
        )
          owners.delete(resource);
    };
    for (let pass = 0; pass < 256; pass++) {
      let progress = false;
      for (const state of states) {
        if (state.done) continue;
        release(state);
        const end = this.topology.length(state.route.sections) - FRONT;
        const controls = this.controls(state.route).filter(
          (i) =>
            i.end + consistLength(state.train.cars) + FRONT > state.at + 1e-8,
        );
        const group = this.group(
          { ...state.train, motion: { ...state.train.motion, velocity: 0 } },
          state.route,
          state.at,
        );
        let next = end;
        if (group.length) {
          const blocked = group.some(
            (i) =>
              owners.has(i.resource) &&
              owners.get(i.resource) !== state.train.id,
          );
          if (blocked)
            next = Math.min(
              end,
              ...group
                .filter((i) => owners.get(i.resource) !== state.train.id)
                .map((i) => i.start - FRONT - 0.1),
            );
          else {
            for (const i of group) owners.set(i.resource, state.train.id);
            next = Math.min(
              end,
              Math.max(...group.map((i) => i.end)) +
                consistLength(state.train.cars) +
                FRONT +
                0.00001,
            );
          }
        } else if (controls.length)
          next = Math.min(end, controls[0].start - FRONT - 0.05);
        if (next > state.at + 1e-8) {
          state.at = next;
          progress = true;
          release(state);
        }
        if (state.at >= end - 1e-8) {
          state.done = true;
          progress = true;
          const standing = new Set([
            `platform:${state.route.destination}`,
            ...this.occupiedBerth(
              state.train,
              state.route.destination,
              state.route.sections.at(-1)!.reverse,
            ).map((i) => i.resource),
          ]);
          for (const [resource, owner] of owners)
            if (owner === state.train.id && !standing.has(resource))
              owners.delete(resource);
        }
      }
      if (states.every((s) => s.done)) return true;
      if (!progress) return false;
    }
    return false;
  }
  private admit(t: TrainState) {
    const p = t.motion.physical,
      settings = this.sim.settings(t.id),
      { options, next, from, to } = this.routeOptions(t);
    const station = this.sim.network.stations.find((s) => s.node === to)!;
    const preferred = settings.platforms[String(to)],
      berths = preferred ? [preferred] : station.platforms;
    const allOwners = new Set<number>();
    let blockedKind: WaitReason['kind'] = 'capacity',
      detail =
        'No direction-compatible route reaches a safe platform. Change the track direction or service.';
    for (const legs of options)
      for (const destination of berths)
        for (const crossover of p.requestedCrossover
          ? [p.requestedCrossover]
          : [
              undefined,
              ...(this.sim.services[t.id].preferred?.length
                ? []
                : (this.sim.network.crossovers ?? []).map((c) => c.id)),
            ]) {
          const sections = crossover
            ? this.topology.crossoverRoute(
                p.berth,
                destination,
                legs,
                crossover,
              )
            : this.topology.route(p.berth, destination, legs);
          if (!sections) continue;
          const route: PhysicalRoute = {
            sections,
            source: p.berth,
            destination,
            from,
            to,
            legs,
            nextLeg: next,
            stop: true,
            ...(crossover ? { crossover } : {}),
          };
          const at = p.berthReverse
            ? BERTH_LENGTH - BERTH_STOP + consistLength(t.cars)
            : BERTH_STOP;
          const required = [
            ...this.intervals(route)
              .filter((i) => i.resource.startsWith('block:'))
              .map((i) => i.resource),
            `platform:${destination}`,
            ...this.occupiedBerth(t, destination).map((i) => i.resource),
            ...this.group(t, route, at).map((i) => i.resource),
          ];
          if (
            this.pendingApproach &&
            required.some((r) => this.pendingApproach!.resources.has(r))
          ) {
            blockedKind = 'capacity';
            detail = `Clearing the approach for ${locomotives[this.pendingApproach.train].name}. Existing journeys may finish.`;
            continue;
          }
          const owners = this.blockers(t, required);
          if (owners.length) {
            owners.forEach((id) => allOwners.add(id));
            blockedKind = this.blockers(t, [`platform:${destination}`]).length
              ? 'platform'
              : 'block';
            detail = `Waiting for a protected route to ${station.name}.`;
            continue;
          }
          // Admission leaves a berth available at the destination. A station with one
          // platform may receive only if its current occupant is already departing.
          // Reserve capacity globally with a Banker's-style completion test below.
          if (!this.feasibleAfter(t, destination)) {
            blockedKind = 'capacity';
            detail = `Keep an escape platform at ${station.name}. Add a platform or release a held train.`;
            continue;
          }
          const key = `${legs[0].edge}:${from}`,
            last = this.sim.dispatch.lastDepartures[key];
          if (
            last !== undefined &&
            this.sim.elapsed - last < settings.headway - 1e-8
          ) {
            blockedKind = 'headway';
            detail = 'Minimum headway on the selected running line.';
            continue;
          }
          if (!this.safeGrant(t, route, at, required)) {
            blockedKind = 'capacity';
            detail = `Waiting for a route with clear exits to ${station.name}.`;
            continue;
          }
          for (const resource of required) this.claim(resource, t);
          p.route = route;
          if (crossover) {
            const purchase = this.sim.construction.find(
              (r) => r.crossover === crossover && r.action === 'crossover',
            );
            if (purchase) purchase.used = true;
          }
          delete p.requestedCrossover;
          p.at = at;
          p.stopTarget = this.topology.length(sections) - FRONT;
          p.blockers = [];
          t.motion.reversed = false;
          if (!this.sim.fleet.units[t.id].detour)
            loadCargo(this.sim, t, from, route.to);
          t.motion.started = true;
          t.distance = 0.000001;
          for (const i of this.intervals(route).filter((i) =>
            i.resource.startsWith('block:'),
          ))
            this.sim.network.edges.find(
              (e) => e.id === i.resource.slice(6),
            )!.used = true;
          t.motion.lateness = Math.max(
            0,
            this.sim.elapsed - t.motion.departureDue,
          );
          t.motion.departures++;
          if (t.motion.lateness <= 2) t.motion.onTime++;
          this.sim.dispatch.lastDepartures[key] = this.sim.elapsed;
          this.sim.dispatch.overrides = this.sim.dispatch.overrides.filter(
            (id) => id !== t.id,
          );
          const changed =
            legs.map((l) => l.edge).join() !==
            this.intended(t)
              .legs.map((l) => l.edge)
              .join();
          p.decision = changed
            ? `Automatic route: ${legs.map((l) => l.edge).join(' → ')} to ${station.name}`
            : `Protected route to ${station.name}`;
          return true;
        }
    this.wait(
      t,
      blockedKind,
      detail,
      [...allOwners].sort((a, b) => a - b),
    );
    // Synchronized retry rounds let priority compare all pending requests.
    p.retryAt = Math.floor(this.sim.elapsed + 1e-8) + 1;
    return false;
  }
  private feasibleAfter(t: TrainState, destination: string, staging = false) {
    // Admit only states from which every unheld train can acquire its next berth
    // and release its old one. This catches multi-owner platform cycles before
    // they form, while allowing terminal shuttles on a one-platform branch.
    const locations = new Map<number, string>();
    const used = new Set<string>();
    for (const train of this.sim.trains) {
      const p = train.motion.physical;
      if (p.queued && train.id !== t.id) continue;
      const b =
        train.id === t.id ? destination : (p.route?.destination ?? p.berth!);
      locations.set(train.id, b);
      used.add(b);
    }
    const pending = new Set(locations.keys());
    let progress = true;
    while (progress) {
      progress = false;
      for (const id of pending) {
        const train = this.sim.trains[id];
        if (train.held && id !== t.id) continue;
        const service = this.sim.services[id],
          p = train.motion.physical;
        const next =
          id === t.id
            ? staging
              ? t.leg
              : this.intended(t).next
            : (p.route?.nextLeg ?? train.leg);
        let leg = next;
        while (!service.legs[leg].stop) {
          leg = (leg + 1) % service.legs.length;
          if (leg === next) break;
        }
        const station = this.sim.network.stations.find(
          (s) => s.node === service.legs[leg].to,
        )!;
        if (
          station.platforms.some((b) => !used.has(b) || b === locations.get(id))
        ) {
          used.delete(locations.get(id)!);
          pending.delete(id);
          progress = true;
        }
      }
    }
    return [...pending].every((id) => this.sim.trains[id].held && id !== t.id);
  }
  move(t: TrainState) {
    const m = t.motion,
      p = m.physical,
      previousWait = m.wait;
    delete m.wait;
    const fleet = this.sim.fleet.units[t.id];
    if (!fleet.owned || fleet.job) {
      if (!fleet.owned) t.held = true;
      m.velocity = 0;
      this.wait(
        t,
        'depot',
        !fleet.owned
          ? 'Purchase an engine for this service.'
          : `${fleet.job!.kind === 'service' ? 'Workshop service' : 'Coal and water'} · ${Math.ceil(fleet.job!.remaining)} s`,
      );
      return;
    }
    if (t.held) {
      m.velocity = 0;
      this.wait(
        t,
        'hold',
        p.queued
          ? 'Held in the off-network depot queue.'
          : 'Held by dispatcher. Occupied track remains protected.',
      );
      return;
    }
    if (t.dwell > 0) {
      t.dwell = Math.max(0, t.dwell - TICK);
      m.velocity = 0;
      t.status = 'At station';
      return;
    }
    if (p.queued && !this.stage(t)) return;
    if (!p.route) {
      if (this.sim.elapsed + 1e-8 < m.departureDue) {
        this.wait(
          t,
          'departure',
          `Departure time ${m.departureDue.toFixed(1)} s`,
        );
        return;
      }
      if (this.sim.elapsed + 1e-8 < p.retryAt) {
        m.wait = previousWait;
        return;
      }
      if (!this.admit(t)) return;
    }
    const route = p.route!,
      length = consistLength(t.cars),
      end = this.topology.length(route.sections) - FRONT;
    const group = this.group(t, route, p.at),
      owners = this.blockers(
        t,
        group.map((i) => i.resource),
      );
    const unsafeOrder =
      !owners.length &&
      group.some((i) => !this.reservation(i.resource)) &&
      !this.safeGrant(
        t,
        route,
        p.at,
        group.map((i) => i.resource),
      );
    let target = end;
    if (owners.length || unsafeOrder) {
      const blocked = group.filter(
        (i) => this.reservation(i.resource)?.owner !== t.id,
      );
      target = Math.min(end, ...blocked.map((i) => i.start - FRONT - 0.1));
      this.wait(
        t,
        'junction',
        `Waiting for a clear movement to ${nodeAt(this.sim.network, route.to).name}.`,
        owners,
      );
    } else
      for (const i of group)
        this.claim(
          i.resource,
          t,
          m.travelled + Math.max(0.000001, i.end + length + FRONT - p.at),
        );
    p.stopTarget = Math.max(p.at, target);
    const current = this.currentSection(t),
      e = this.sim.track(t),
      physics = performance(
        t.id,
        t.cars,
        t.load,
        {
          ...e,
          points: current.points,
          length: current.length,
          radius: current.radius,
        },
        route.sections.find((s) => s.section === current.id)!.reverse
          ? e.b
          : e.a,
        this.sim.fleet.units[t.id],
      );
    let curveLimit = physics.limit,
      base = 0;
    for (const part of route.sections) {
      const section = this.topology.sections.get(part.section)!;
      if (base + section.length >= p.at - length - FRONT) {
        const limit =
          Math.sqrt(Math.max(1, section.radius) * 0.23) /
          (1 + (t.cars - 3) * 0.025);
        curveLimit = Math.min(
          curveLimit,
          Math.sqrt(
            limit * limit +
              2 * BRAKE * Math.max(0, base - p.at - FRONT - m.velocity * TICK),
          ),
        );
      }
      base += section.length;
    }
    const speed = advanceVelocity(
      m.velocity,
      curveLimit,
      Math.max(0, target - p.at),
      physics.acceleration,
    );
    let delta = Math.min(Math.max(0, target - p.at), speed * TICK);
    if (!owners.length && end - p.at < 0.002 && speed < 0.06)
      delta = end - p.at;
    const boxes = this.boxes(t),
      swept = boxes.map((b) => {
        const behind = m.reversed ? length - b.offset : b.offset;
        return sweptEnvelope(
          b,
          delta,
          this.topology.turnBound(
            route.sections,
            p.at - behind,
            p.at + delta - behind,
          ),
        );
      });
    const blocker = swept.map((b) => this.tickIndex.conflict(b)).find(Boolean);
    if (blocker) {
      m.velocity = 0;
      p.emergencies++;
      this.wait(
        t,
        'collision',
        `Safety stop: ${locomotives[blocker.train].name} occupies the proposed movement.`,
        [blocker.train],
      );
      return;
    }
    m.velocity = speed;
    p.at += delta;
    m.travelled += delta;
    for (const b of swept) this.tickIndex.add(b);
    t.distance = Math.min(e.length - 0.000001, Math.max(0.000001, p.at));
    if (!owners.length && !unsafeOrder) {
      m.waitingSince = null;
      t.status = 'Running';
    }
    this.releaseBehind(t);
    if (p.at >= end - 1e-8 && !owners.length && !unsafeOrder) this.arrive(t);
  }
  currentSection(t: TrainState) {
    const p = t.motion.physical;
    let at = p.at;
    for (const part of p.route?.sections ?? [
      {
        section: p.berth ?? this.sim.network.stations[0].platforms[0],
        reverse: false,
      },
    ]) {
      const s = this.topology.sections.get(part.section)!;
      if (at <= s.length) return s;
      at -= s.length;
    }
    return this.topology.sections.get(p.route!.destination)!;
  }
  private releaseBehind(t: TrainState) {
    const m = t.motion,
      p = m.physical,
      route = p.route!;
    const intervals = this.intervals(route),
      endFor = new Map(intervals.map((i) => [i.resource, i.end]));

    if (route.source)
      endFor.set(
        `platform:${route.source}`,
        this.topology.sections.get(route.source)!.length,
      );
    this.sim.dispatch.reservations = this.sim.dispatch.reservations.filter(
      (r) =>
        r.owner !== t.id ||
        r.resource === `platform:${route.destination}` ||
        p.at <
          (endFor.get(r.resource) ?? Infinity) +
            consistLength(t.cars) +
            FRONT -
            1e-8,
    );
  }
  private arrive(t: TrainState) {
    const m = t.motion,
      p = m.physical,
      route = p.route!;
    // The complete train now stands on a real platform path. Future route grants
    // are cancelled; physical berth/approach protection is reconstructed.
    this.sim.dispatch.reservations = this.sim.dispatch.reservations.filter(
      (r) => r.owner !== t.id,
    );
    p.berth = route.destination;
    p.berthReverse = route.sections.at(-1)!.reverse;
    delete p.route;
    p.at = 0;
    p.retryAt = 0;
    p.stopTarget = BERTH_STOP;
    t.leg = route.nextLeg;
    t.distance = 0;
    m.started = false;
    m.velocity = 0;
    m.history = route.legs.map((l) => ({
      ...l,
      length: this.sim.network.edges.find((e) => e.id === l.edge)!.length,
    }));
    this.holdBerth(t);
    if (route.stop) {
      p.recoveryAttempts = 0;
      p.lastCallAt = this.sim.elapsed;
      unloadCargo(this.sim, t, route.to);
      m.calls++;
      t.dwell = this.sim.services[t.id].dwell;
      for (const record of this.sim.construction)
        if (record.station === `station-${route.to}` && !record.reversed)
          record.used = true;
    }
    if (t.stopAtStation || (route.recovering && !route.automaticRecovery)) {
      t.held = true;
      t.stopAtStation = false;
    }
    const settings = this.sim.settings(t.id),
      ready = this.sim.elapsed + t.dwell;
    m.departureDue =
      settings.interval > 0
        ? settings.firstDeparture +
          Math.max(
            0,
            Math.ceil(
              (ready - settings.firstDeparture) / settings.interval - 1e-9,
            ),
          ) *
            settings.interval
        : Math.max(ready, settings.firstDeparture);
    t.status = t.held ? 'On hold' : 'At station';
  }
  canTurnBack(t: TrainState) {
    const p = t.motion.physical,
      r = p.route;
    if (
      !r ||
      !r.source ||
      t.motion.velocity > 0.06 ||
      r.recovering ||
      r.crossover
    )
      return false;
    if (this.blockers(t, [`platform:${r.source}`]).length) return false;
    return r.legs.every((l) => {
      const e = this.sim.network.edges.find((e) => e.id === l.edge)!;
      return !e.direction || e.direction === 'both';
    });
  }
  turnBack(t: TrainState, automatic = false) {
    if (!this.canTurnBack(t))
      throw new Error(
        'Stop on a bidirectional route with a free return platform before turning back.',
      );
    const p = t.motion.physical,
      r = p.route!,
      sections = [...r.sections]
        .reverse()
        .map((s) => ({ ...s, reverse: !s.reverse }));
    const at = this.topology.length(sections) - p.at + consistLength(t.cars);
    const route: PhysicalRoute = {
      ...r,
      sections,
      source: r.destination,
      destination: r.source!,
      from: r.to,
      to: r.from,
      legs: [...r.legs]
        .reverse()
        .map((l) => ({ ...l, from: l.to, to: l.from })),
      nextLeg: t.leg,
      stop: false,
      recovering: true,
      ...(automatic ? { automaticRecovery: true } : {}),
    };
    const group = this.group(t, route, at),
      required = [
        `platform:${route.destination}`,
        ...this.occupiedBerth(
          t,
          route.destination,
          route.sections.at(-1)!.reverse,
        ).map((i) => i.resource),
        ...this.intervals(route)
          .filter(
            (i) =>
              i.resource.startsWith('block:') &&
              i.end + consistLength(t.cars) + FRONT > at,
          )
          .map((i) => i.resource),
        ...group.map((i) => i.resource),
      ];
    if (this.blockers(t, required).length)
      throw new Error(
        'The return movement is occupied. Release its blocking train first.',
      );
    for (const resource of required) this.claim(resource, t);
    p.route = route;
    if (automatic) p.recoveryAttempts++;
    p.stopTarget = this.topology.length(sections) - FRONT;
    p.at = at;
    p.retryAt = 0;
    p.decision =
      'Returning to the previous platform; the original service is retained.';
    t.motion.reversed = !t.motion.reversed;
    t.held = false;
    t.dwell = 0;
  }
  recoverWaits() {
    const cyclic = new Set(
      circularWaits(
        this.sim.trains.map((t) => ({
          id: t.id,
          owners: t.motion.physical.blockers,
        })),
      ).flat(),
    );
    for (const t of this.sim.trains) {
      const m = t.motion,
        p = m.physical;
      if (
        !cyclic.has(t.id) ||
        t.held ||
        m.wait?.kind !== 'junction' ||
        m.waitingSince === null ||
        this.sim.elapsed - m.waitingSince < 120 ||
        p.recoveryAttempts >= 2 ||
        p.recoveryAfter > this.sim.elapsed ||
        !this.canTurnBack(t)
      )
        continue;
      p.recoveryAfter = this.sim.elapsed + 30;
      try {
        this.turnBack(t, true);
        p.decision =
          'Automatic return to a clear platform; scheduled stops are preserved.';
      } catch {
        p.decision =
          'Return route is occupied. Waiting safely for clearance or additional capacity.';
      }
    }
  }
  refreshProtection() {
    for (const t of this.sim.trains) {
      const p = t.motion.physical;
      if (p.queued) continue;
      if (!p.route) {
        this.holdBerth(t);
        continue;
      }
      for (const i of this.intervals(p.route))
        if (
          i.start <= p.at + FRONT &&
          i.end + consistLength(t.cars) + FRONT > p.at + 1e-8
        )
          this.claim(
            i.resource,
            t,
            t.motion.travelled + i.end + consistLength(t.cars) + FRONT - p.at,
          );
    }
  }
  canAddCar(t: TrainState) {
    if (t.motion.physical.queued) return true;
    const candidate = { ...t, cars: t.cars + 1 };
    if (
      this.blockers(
        t,
        this.occupiedBerth(candidate, t.motion.physical.berth!).map(
          (i) => i.resource,
        ),
      ).length
    )
      return false;
    return !collision([
      ...this.allEnvelopes().filter((e) => e.train !== t.id),
      ...this.boxes(candidate),
    ]);
  }
  signal(section: string, reverse: boolean) {
    return this.sim.trains.some((t) => {
      const p = t.motion.physical,
        r = p.route;
      if (!r || t.held) return false;
      let base = 0;
      for (const part of r.sections) {
        const s = this.topology.sections.get(part.section)!;
        if (
          part.section === section &&
          part.reverse === reverse &&
          p.at >= base - FRONT &&
          p.at <= base + s.length &&
          p.stopTarget >= base + s.length - FRONT &&
          this.controls(r)
            .filter((i) => i.start <= base + s.length && i.end >= p.at)
            .every((i) => this.reservation(i.resource)?.owner === t.id)
        )
          return true;
        base += s.length;
      }
      return false;
    });
  }
  validate() {
    const items = this.allEnvelopes(),
      hit = collision(items);
    if (hit)
      throw new Error(
        `Physical collision in save between trains ${hit[0].train} and ${hit[1].train}.`,
      );
    for (const t of this.sim.trains) {
      const p = t.motion.physical;
      if (
        !p ||
        typeof p.queued !== 'boolean' ||
        (p.berthReverse !== undefined && typeof p.berthReverse !== 'boolean') ||
        ![
          p.at,
          p.stopTarget,
          p.retryAt,
          p.emergencies,
          p.recoveryAttempts,
          p.recoveryAfter,
          p.lastCallAt,
        ].every((n) => Number.isFinite(n) && n >= 0) ||
        !Number.isSafeInteger(p.emergencies) ||
        !Number.isInteger(p.recoveryAttempts) ||
        p.recoveryAttempts > 2 ||
        !Array.isArray(p.blockers) ||
        p.blockers.some(
          (id) => !Number.isInteger(id) || !this.sim.trains[id] || id === t.id,
        )
      )
        throw new Error('Invalid physical motion.');
      if (p.queued) {
        if (
          p.berth ||
          p.berthReverse ||
          p.route ||
          t.motion.started ||
          t.distance !== 0 ||
          t.motion.velocity !== 0 ||
          this.sim.dispatch.reservations.some((r) => r.owner === t.id)
        )
          throw new Error('Invalid depot queue state.');
        continue;
      }
      if (!p.berth || !this.topology.sections.has(p.berth))
        throw new Error('Missing physical berth.');
      const r = p.route;
      if (
        p.requestedCrossover &&
        !this.sim.network.crossovers?.some((c) => c.id === p.requestedCrossover)
      )
        throw new Error('Missing requested crossover.');
      const allowed = new Set(
        r
          ? [
              ...this.intervals(r).map((i) => i.resource),
              `platform:${r.destination}`,
              `platform:${r.source}`,
            ]
          : [
              ...this.occupiedBerth(t, p.berth).map((i) => i.resource),
              `platform:${p.berth}`,
            ],
      );
      for (const reservation of this.sim.dispatch.reservations.filter(
        (r) => r.owner === t.id,
      )) {
        if (!allowed.has(reservation.resource))
          throw new Error('Reservation lies outside the physical route.');
        if (!r && reservation.releaseAt !== null)
          throw new Error('A standing berth cannot expire.');
        const interval = r
          ? this.intervals(r).find((i) => i.resource === reservation.resource)
          : undefined;
        if (
          interval &&
          reservation.releaseAt !== null &&
          reservation.releaseAt + 1e-7 <
            t.motion.travelled +
              interval.end +
              consistLength(t.cars) +
              FRONT -
              p.at
        )
          throw new Error('Movement protection expires before rear clearance.');
      }
      if (r) {
        if (t.motion.reversed !== !!r.recovering)
          throw new Error('Invalid leading-end orientation for this route.');
        if (
          p.stopTarget > this.topology.length(r.sections) - FRONT + 1e-7 ||
          p.stopTarget < p.at - 1e-7 ||
          (t.motion.velocity * t.motion.velocity) / (2 * BRAKE) >
            p.stopTarget - p.at + 0.2
        )
          throw new Error('Invalid braking authority.');
        if (
          r.from !== r.legs[0].from ||
          r.to !== r.legs.at(-1)!.to ||
          !this.sim.network.stations
            .find((s) => s.node === r.to)
            ?.platforms.includes(r.destination)
        )
          throw new Error('Invalid route destination.');

        const intent = this.intended(t);
        if (
          r.recovering
            ? r.nextLeg !== t.leg || r.stop || r.to !== intent.legs[0].from
            : r.nextLeg !== intent.next ||
              !r.stop ||
              r.from !== intent.legs[0].from ||
              r.to !== intent.legs.at(-1)!.to
        )
          throw new Error('Operational route does not preserve service calls.');

        const pinned = this.sim.services[t.id].preferred ?? [];
        if (
          !r.recovering &&
          intent.legs.some(
            (l) =>
              pinned.includes(l.edge) &&
              !r.legs.some((actual) => actual.edge === l.edge),
          )
        )
          throw new Error(
            'Operational route violates an explicit track preference.',
          );
        const expected = r.crossover
          ? this.topology.crossoverRoute(
              r.source,
              r.destination,
              r.legs,
              r.crossover,
            )
          : this.topology.route(r.source, r.destination, r.legs);
        if (
          !expected ||
          (!r.recovering &&
            JSON.stringify(expected) !== JSON.stringify(r.sections))
        )
          throw new Error('Invalid physical route or turnout connection.');
        if (r.recovering) {
          const forward = this.topology.route(
            r.destination,
            r.source!,
            [...r.legs]
              .reverse()
              .map((l) => ({ ...l, from: l.to, to: l.from })),
          );
          if (
            !forward ||
            JSON.stringify(
              forward.reverse().map((s) => ({ ...s, reverse: !s.reverse })),
            ) !== JSON.stringify(r.sections)
          )
            throw new Error('Invalid recovery path.');
        }
        if (
          !t.motion.started ||
          p.at < consistLength(t.cars) ||
          p.at > this.topology.length(r.sections) - FRONT + 1e-8 ||
          !Number.isInteger(r.nextLeg) ||
          r.nextLeg < 0 ||
          r.nextLeg >= this.sim.services[t.id].legs.length
        )
          throw new Error('Invalid route progress.');
        for (const interval of this.intervals(r).filter((i) =>
          i.resource.startsWith('block:'),
        )) {
          if (
            p.at < interval.end + consistLength(t.cars) + FRONT - 1e-8 &&
            this.reservation(interval.resource)?.owner !== t.id
          )
            throw new Error('Missing route block protection.');
        }
        for (const i of this.controls(r))
          if (
            i.start <= p.at + FRONT &&
            i.end + consistLength(t.cars) + FRONT > p.at + 1e-8 &&
            this.reservation(i.resource)?.owner !== t.id
          )
            throw new Error('Missing occupied movement protection.');
      } else {
        if (
          t.motion.started ||
          t.motion.reversed !== (p.berthReverse ?? false) ||
          p.at !== 0 ||
          !this.sim.network.stations
            .find((s) => s.node === this.sim.endpoints(t)[0])
            ?.platforms.includes(p.berth)
        )
          throw new Error('Invalid standing train.');
        for (const i of this.occupiedBerth(t, p.berth))
          if (this.reservation(i.resource)?.owner !== t.id)
            throw new Error('Missing standing berth protection.');
      }
      if (
        this.reservation(`platform:${r?.destination ?? p.berth}`)?.owner !==
        t.id
      )
        throw new Error('Missing safe destination platform.');
    }
  }
}
