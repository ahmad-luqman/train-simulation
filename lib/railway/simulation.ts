import {
  advanceVelocity,
  circularWaits,
  consistLength,
  defaultDispatch,
  newMotion,
  pathPosition,
  performance,
  TICK,
  TURNOUT_CLEARANCE,
  type DispatchState,
  type DispatchSettings,
  type Motion,
  type WaitReason,
} from './dispatch';
import { locomotives } from './data';
import {
  createNetwork,
  edgeAt,
  measure,
  nodeAt,
  planService,
  quoteConstruction,
  type Construction,
  type Cost,
  type RailNetwork,
  type RouteLeg,
  type Service,
} from './network';
export { edgeKey } from './network';
export type TrainState = {
  id: number;
  leg: number;
  distance: number;
  held: boolean;
  dwell: number;
  cars: number;
  delivered: number;
  revenue: number;
  status: 'Running' | 'At station' | 'At signal' | 'On hold';
  load: number;
  stopAtStation?: boolean;
  motion: Motion;
};
export type ConstructionRecord = {
  id: number;
  action: 'build' | 'station' | 'platform' | 'bulldoze' | 'undo';
  edge?: string;
  station?: string;
  platform?: string;
  node?: number;
  cost: Cost;
  amount: number;
  reversed?: boolean;
  undoOf?: number;
  used?: boolean;
};
export type SaveState = {
  version: 3;
  dispatch: DispatchState;
  elapsed: number;
  accumulator: number;
  treasury: number;
  delivered: number;
  trains: TrainState[];
  network: RailNetwork;
  services: Service[];
  construction: ConstructionRecord[];
};
export class Simulation {
  network = createNetwork();
  services: Service[] = locomotives.map((l, id) =>
    planService(this.network, id, `${l.name} service`, l.route, 3.5),
  );
  construction: ConstructionRecord[] = [];
  revision = 0;
  trains: TrainState[] = locomotives.map((_, id) => ({
    id,
    leg: 0,
    distance: 0,
    held: false,
    dwell: id * 0.8,
    cars: 3,
    delivered: 0,
    revenue: 0,
    status: 'At station',
    load: 62 + ((id * 7) % 35),
    motion: { ...newMotion(), departureDue: id * 0.8 },
  }));
  treasury = 425000;
  delivered = 0;
  elapsed = 0;
  speed = 1;
  paused = false;
  events = ['Meridian Railway is open. All services ready for dispatch.'];
  lengths = new Map(this.network.edges.map((e) => [e.id, e.length]));
  occupied = new Map<string, number>();
  private accumulator = 0;
  dispatch: DispatchState = {
    reservations: [],
    lastDepartures: {},
    overrides: [],
  };
  endpoints(t: TrainState, offset = 0) {
    const legs = this.services[t.id].legs,
      leg = legs[(t.leg + offset + legs.length) % legs.length];
    return [leg.from, leg.to] as const;
  }
  track(t: TrainState, offset = 0) {
    const legs = this.services[t.id].legs;
    return edgeAt(
      this.network,
      legs[(t.leg + offset + legs.length) % legs.length].edge,
    );
  }
  step(realDelta: number) {
    if (this.paused || !Number.isFinite(realDelta) || realDelta <= 0) return;
    this.accumulator += Math.min(realDelta, 0.25) * this.speed;
    while (this.accumulator >= 0.05 - 1e-10) {
      this.accumulator = Math.max(0, this.accumulator - 0.05);
      this.elapsed += 0.05;
      this.releaseCleared();
      const order = [...this.trains].sort(
        (a, b) => this.dispatchRank(b) - this.dispatchRank(a) || a.id - b.id,
      );
      for (const t of order) this.moveTrain(t);
      this.releaseCleared();
    }
  }
  settings(id: number): DispatchSettings {
    return this.services[id].dispatch ?? defaultDispatch(id);
  }
  private dispatchRank(t: TrainState) {
    return (
      (this.dispatch.overrides.includes(t.id) ? 10000 : 0) +
      (this.settings(t.id).priority === 'passenger' ? 10 : 0) +
      Math.min(
        100,
        (this.elapsed - (t.motion.waitingSince ?? this.elapsed)) / 2,
      )
    );
  }
  private reservation(resource: string) {
    return this.dispatch.reservations.find((r) => r.resource === resource);
  }
  private claim(
    resource: string,
    t: TrainState,
    releaseAt: number | null = null,
  ) {
    const old = this.reservation(resource);
    if (old && old.owner !== t.id)
      throw new Error('Conflicting dispatch reservation.');
    if (old) old.releaseAt = releaseAt;
    else this.dispatch.reservations.push({ resource, owner: t.id, releaseAt });
  }
  private releaseCleared() {
    this.dispatch.reservations = this.dispatch.reservations.filter(
      (r) =>
        r.releaseAt === null ||
        this.trains[r.owner].motion.travelled < r.releaseAt - 1e-8,
    );
    this.occupied = new Map(
      this.dispatch.reservations
        .filter((r) => r.resource.startsWith('block:'))
        .map((r) => [r.resource.slice(6), r.owner]),
    );
  }
  private wait(t: TrainState, reason: WaitReason) {
    t.motion.wait = reason;
    t.motion.waitingSince ??= this.elapsed;
    t.status = reason.kind === 'hold' ? 'On hold' : 'At signal';
  }
  private conflict(
    resource: string,
    t: TrainState,
    kind: WaitReason['kind'],
    label: string,
  ): WaitReason | undefined {
    const r = this.reservation(resource);
    return r && r.owner !== t.id
      ? {
          kind,
          resource,
          owner: r.owner,
          message: `${label} · ${locomotives[r.owner].name}`,
        }
      : undefined;
  }
  private platform(t: TrainState, node: number) {
    const station = this.network.stations.find((s) => s.node === node);
    if (!station) return undefined;
    const reserved = station.platforms.find(
      (p) => this.reservation(`platform:${p}`)?.owner === t.id,
    );
    if (reserved) return reserved;
    const preferred = this.settings(t.id).platforms[String(node)];
    const choices = preferred ? [preferred] : station.platforms;
    return (
      choices.find(
        (p) =>
          !this.conflict(`platform:${p}`, t, 'platform', 'Platform occupied'),
      ) ?? choices[0]
    );
  }
  private entryReason(t: TrainState): WaitReason | undefined {
    const edge = this.track(t),
      [from, to] = this.endpoints(t);
    if (
      (edge.direction === 'a-to-b' && from !== edge.a) ||
      (edge.direction === 'b-to-a' && from !== edge.b)
    )
      return {
        kind: 'direction',
        message:
          'Track direction prohibits this departure. Change direction or use a parallel track.',
      };
    const platform = this.platform(t, to);
    if (edge.length <= consistLength(t.cars) + TURNOUT_CLEARANCE)
      return {
        kind: 'block',
        message:
          'This track is too short to clear the complete consist. Assign a longer route.',
      };
    return (
      this.conflict(
        `block:${edge.id}`,
        t,
        'block',
        `Occupied block ${edge.id}`,
      ) ??
      this.conflict(
        `junction:${from}`,
        t,
        'junction',
        `Conflicting movement at ${nodeAt(this.network, from).name}`,
      ) ??
      (platform
        ? this.conflict(
            `platform:${platform}`,
            t,
            'platform',
            `No available platform at ${nodeAt(this.network, to).name}`,
          )
        : undefined)
    );
  }
  private beginLeg(t: TrainState) {
    const edge = this.track(t),
      [from, to] = this.endpoints(t),
      m = t.motion;
    const previous = m.history.at(-1);
    // Reverse the direction of travel, not the physical vehicles. The old rear leads.
    if (previous?.edge === edge.id && previous.from === to) {
      t.distance = Math.min(consistLength(t.cars), edge.length - 0.01);
      m.reversed = !m.reversed;
      m.history = [];
    }
    this.claim(`block:${edge.id}`, t);
    this.claim(
      `junction:${from}`,
      t,
      m.travelled + consistLength(t.cars) + TURNOUT_CLEARANCE,
    );
    const destination = this.platform(t, to);
    if (destination) this.claim(`platform:${destination}`, t);
    const source = this.network.stations.find((s) => s.node === from);
    for (const r of this.dispatch.reservations)
      if (
        r.owner === t.id &&
        source?.platforms.some((p) => r.resource === `platform:${p}`)
      )
        r.releaseAt = m.travelled + consistLength(t.cars) + TURNOUT_CLEARANCE;
    m.started = true;
    edge.used = true;
    const key = `${edge.id}:${from}`;
    this.dispatch.lastDepartures[key] = this.elapsed;
    m.lateness = Math.max(0, this.elapsed - m.departureDue);
    m.departures++;
    if (m.lateness <= 2) m.onTime++;
    this.dispatch.overrides = this.dispatch.overrides.filter(
      (id) => id !== t.id,
    );
  }
  private moveTrain(t: TrainState) {
    const m = t.motion;
    delete m.wait;
    if (t.held) {
      // Hold is an emergency dispatcher stop; ownership is retained.
      m.velocity = 0;
      this.wait(t, {
        kind: 'hold',
        message: 'Held by dispatcher. Release to continue.',
      });
      return;
    }
    if (t.dwell > 0) {
      t.dwell = Math.max(0, t.dwell - TICK);
      m.velocity = 0;
      t.status = 'At station';
      return;
    }
    if (!m.started) {
      const settings = this.settings(t.id),
        edge = this.track(t),
        [from] = this.endpoints(t);
      const last = this.dispatch.lastDepartures[`${edge.id}:${from}`];
      const reason: WaitReason | undefined =
        this.elapsed + 1e-8 < m.departureDue
          ? {
              kind: 'departure',
              message: `Departure time ${m.departureDue.toFixed(1)} s`,
            }
          : last !== undefined && this.elapsed - last < settings.headway - 1e-8
            ? {
                kind: 'headway',
                message: `Minimum headway · ${(settings.headway - this.elapsed + last).toFixed(1)} s`,
              }
            : this.entryReason(t);
      if (reason) {
        this.wait(t, reason);
        m.velocity = 0;
        return;
      }
      this.beginLeg(t);
    }
    const edge = this.track(t),
      [, to] = this.endpoints(t);
    const remaining = edge.length - t.distance;
    const junction = `junction:${to}`;
    const destination = this.platform(t, to);
    const reason =
      this.conflict(
        junction,
        t,
        'junction',
        `Conflicting movement at ${nodeAt(this.network, to).name}`,
      ) ??
      (destination
        ? this.conflict(
            `platform:${destination}`,
            t,
            'platform',
            `No available platform at ${nodeAt(this.network, to).name}`,
          )
        : undefined);
    const stopDistance = Math.max(
      0,
      remaining - (reason ? TURNOUT_CLEARANCE : 0),
    );
    if (!reason && remaining <= consistLength(t.cars) + TURNOUT_CLEARANCE) {
      this.claim(junction, t);
      if (destination) this.claim(`platform:${destination}`, t);
    }
    const physics = performance(
      t.id,
      t.cars,
      t.load,
      edge,
      this.endpoints(t)[0],
    );
    m.velocity = advanceVelocity(
      m.velocity,
      physics.limit,
      stopDistance,
      physics.acceleration,
    );
    const delta = Math.min(stopDistance, m.velocity * TICK);
    t.distance += delta;
    m.travelled += delta;
    while (
      m.history.length &&
      t.distance +
        m.history.slice(1).reduce((sum, leg) => sum + leg.length, 0) >=
        consistLength(t.cars)
    )
      m.history.shift();
    t.status = 'Running';
    if (reason) this.wait(t, reason);
    else m.waitingSince = null;
    // Snap only the final sub-millimetre integration remainder at zero speed.
    if (!reason && edge.length - t.distance < 0.002 && m.velocity < 0.06) {
      m.travelled += edge.length - t.distance;
      this.arrive(t);
    }
  }
  private arrive(t: TrainState) {
    const service = this.services[t.id],
      leg = service.legs[t.leg],
      edge = this.track(t),
      m = t.motion;
    this.claim(`block:${edge.id}`, t, m.travelled + consistLength(t.cars));
    m.history.push({ ...leg, length: edge.length });
    let retained = 0;
    m.history = m.history
      .reverse()
      .filter((section) => {
        const keep = retained < consistLength(6);
        retained += section.length;
        return keep;
      })
      .reverse();
    if (leg.stop) {
      for (const record of this.construction)
        if (record.station === `station-${leg.to}` && !record.reversed)
          record.used = true;
      const amount = Math.round((t.cars * 18 * t.load) / 100),
        income = Math.round(amount * (40 + edge.length * 1.7));
      t.delivered += amount;
      t.revenue += income;
      this.delivered += amount;
      this.treasury += income;
      this.events.unshift(
        `${locomotives[t.id].name} → ${nodeAt(this.network, leg.to).name} · ${amount} delivered · +$${income.toLocaleString('en-US')}`,
      );
      this.events = this.events.slice(0, 20);
      t.dwell = service.dwell;
      t.load = 60 + ((t.delivered + t.id * 3) % 37);
      m.calls++;
      if (t.stopAtStation) {
        t.held = true;
        t.stopAtStation = false;
      }
    }
    t.leg = (t.leg + 1) % service.legs.length;
    t.distance = 0;
    m.started = false;
    m.velocity = 0;
    const settings = this.settings(t.id),
      ready = this.elapsed + t.dwell;
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
    t.status = t.held ? 'On hold' : t.dwell > 0 ? 'At station' : 'At signal';
  }
  vehiclePosition(t: TrainState, offset: number) {
    const m = t.motion;
    let leg = this.services[t.id].legs[t.leg],
      distance = t.distance,
      history = m.history;
    if (!m.started && history.length) {
      const last = history.at(-1)!;
      leg = last;
      distance = last.length;
      history = history.slice(0, -1);
    }
    const behind = m.reversed ? consistLength(t.cars) - offset : offset;
    const result = pathPosition(this.network, leg, distance - behind, history);
    if (m.reversed) result.angle += Math.PI;
    return result;
  }
  configureDispatch(id: number, settings: DispatchSettings) {
    if (!this.trains[id]) throw new Error('Choose a train.');
    validateDispatch(this.network, settings);
    this.services[id].dispatch = structuredClone(settings);
    const t = this.trains[id];
    if (!t.motion.started) {
      const ready = this.elapsed + t.dwell;
      t.motion.departureDue =
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
    }
    this.revision++;
  }
  prioritize(id: number) {
    if (!this.trains[id]) throw new Error('Choose a train.');
    if (!this.dispatch.overrides.includes(id)) this.dispatch.overrides.push(id);
  }
  setDirection(id: string, direction: 'both' | 'a-to-b' | 'b-to-a') {
    const edge = edgeAt(this.network, id);
    if (!edge || !['both', 'a-to-b', 'b-to-a'].includes(direction))
      throw new Error('Choose a track direction.');
    if (this.protectedEdges().has(id) || this.reservation(`block:${id}`))
      throw new Error('Wait until the complete train clears this track.');
    edge.direction = direction;
    this.revision++;
  }
  parallelOptions(id: number) {
    const t = this.trains[id];
    if (!t || t.motion.started || t.motion.velocity > 0) return [];
    const [from, to] = this.endpoints(t),
      current = this.track(t);
    return this.network.edges.filter(
      (e) =>
        e.id !== current.id &&
        ((e.a === from && e.b === to) || (e.a === to && e.b === from)) &&
        (!e.direction ||
          e.direction === 'both' ||
          (e.direction === 'a-to-b' ? e.a === from : e.b === from)) &&
        !this.conflict(`block:${e.id}`, t, 'block', 'Occupied'),
    );
  }
  useParallel(id: number, edge: string) {
    if (!this.parallelOptions(id).some((e) => e.id === edge))
      throw new Error(
        'Stop before departure and choose a free parallel track.',
      );
    this.services[id].legs[this.trains[id].leg].edge = edge;
    this.prioritize(id);
    this.revision++;
  }
  canTurnBack(id: number) {
    const t = this.trains[id];
    if (!t || t.motion.velocity > 0.06) return false;
    const previous = t.motion.history.at(-1);
    const leg =
      !t.motion.started && previous ? previous : this.services[id].legs[t.leg];
    const edge = edgeAt(this.network, leg.edge),
      from = leg.from,
      to = leg.to;
    if (
      (t.motion.started ? t.distance : (previous?.length ?? 0)) <=
      consistLength(t.cars) + TURNOUT_CLEARANCE
    )
      return false;
    return (
      this.network.stations.some((s) => s.node === from) &&
      this.network.stations.some((s) => s.node === to) &&
      (!edge.direction || edge.direction === 'both')
    );
  }
  turnBack(id: number) {
    if (!this.canTurnBack(id))
      throw new Error(
        'Stop with the entire consist beyond the turnout on a bidirectional station track before turning back.',
      );
    const t = this.trains[id],
      m = t.motion;
    const previous = m.history.at(-1);
    const leg =
      !m.started && previous ? previous : this.services[id].legs[t.leg];
    const edge = edgeAt(this.network, leg.edge),
      from = leg.from,
      to = leg.to;
    const distance = m.started ? t.distance : edge.length;
    const service = planService(
      this.network,
      id,
      'Recovery shuttle',
      [to, from],
      this.services[id].dwell,
      [edge.id],
    );
    service.dispatch = structuredClone(this.settings(id));
    // The old rear becomes the lead; every vehicle remains at the same chainage.
    t.distance = edge.length - distance + consistLength(t.cars);
    t.leg = 0;
    this.services[id] = service;
    m.reversed = !m.reversed;
    m.history = [];
    m.velocity = 0;
    m.started = true;
    t.dwell = 0;
    t.held = false;
    t.stopAtStation = true;
    for (const r of this.dispatch.reservations) {
      if (r.owner !== id || r.resource === `block:${edge.id}`) continue;
      // Reservations on the old path stay locked until a complete consist has moved away.
      r.releaseAt = m.travelled + consistLength(t.cars) + TURNOUT_CLEARANCE;
    }
    this.claim(`block:${edge.id}`, t);
    this.revision++;
  }
  dispatcherSnapshot() {
    const waits = this.trains
      .filter((t) => t.motion.wait)
      .map((t) => ({
        id: t.id,
        ...t.motion.wait!,
        seconds: this.elapsed - (t.motion.waitingSince ?? this.elapsed),
      }));
    const departures = this.trains.reduce((n, t) => n + t.motion.departures, 0),
      onTime = this.trains.reduce((n, t) => n + t.motion.onTime, 0);
    return {
      waits,
      cycles: circularWaits(waits),
      reservations: this.dispatch.reservations,
      departures,
      punctuality: departures ? (onTime / departures) * 100 : 100,
      throughput: this.elapsed
        ? (this.trains.reduce((n, t) => n + t.motion.calls, 0) / this.elapsed) *
          60
        : 0,
    };
  }

  addCar(id: number) {
    const t = this.trains[id];
    if (
      !t ||
      t.cars >= 6 ||
      this.treasury < 8500 ||
      t.motion.started ||
      t.motion.reversed
    )
      return false;
    let rear = consistLength(t.cars + 1);
    for (const leg of [...t.motion.history].reverse()) {
      if (rear <= 0) break;
      if (this.conflict(`block:${leg.edge}`, t, 'block', 'Occupied'))
        return false;
      rear -= leg.length;
    }
    if (t.motion.history.length && rear > 0) return false;
    for (const r of this.dispatch.reservations)
      if (r.owner === id && r.releaseAt !== null) r.releaseAt += 3;
    t.cars++;
    this.treasury -= 8500;
    return true;
  }
  stopForEditing(id: number) {
    const t = this.trains[id];
    if (!t) throw new Error('Choose a train.');
    if (
      t.distance === 0 &&
      this.network.stations.some((s) => s.node === this.endpoints(t)[0])
    ) {
      t.held = true;
      t.status = 'On hold';
    } else {
      t.held = false;
      t.stopAtStation = true;
    }
  }
  assignService(service: Service) {
    const t = this.trains[service.trainId];
    if (!t) throw new Error('Choose a train.');
    validateService(this.network, service, service.trainId);
    if (
      !t.held ||
      t.distance !== 0 ||
      !this.network.stations.some((s) => s.node === this.endpoints(t)[0])
    )
      throw new Error(
        'Stop this train at a station before changing its service.',
      );
    const at = this.endpoints(t)[0];
    if (service.legs[0].from !== at)
      throw new Error(
        `The first stop must be ${nodeAt(this.network, at).name}, where this train is waiting.`,
      );
    for (const r of this.dispatch.reservations) {
      if (r.owner !== t.id || !r.resource.startsWith('platform:')) continue;
      const atStation = this.network.stations.find((s) => s.node === at)!;
      if (!atStation.platforms.some((p) => r.resource === `platform:${p}`))
        throw new Error('Clear the previous station before changing service.');
    }
    const schedule = structuredClone(service.dispatch ?? this.settings(t.id));
    this.services[t.id] = structuredClone(service);
    if (
      service.dispatch ||
      JSON.stringify(schedule) !== JSON.stringify(defaultDispatch(t.id))
    )
      this.services[t.id].dispatch = schedule;
    t.leg = 0;
    t.distance = 0;
    t.dwell = service.dwell;
    const ready = this.elapsed + t.dwell;
    t.motion.departureDue =
      schedule.interval > 0
        ? schedule.firstDeparture +
          Math.max(
            0,
            Math.ceil(
              (ready - schedule.firstDeparture) / schedule.interval - 1e-9,
            ),
          ) *
            schedule.interval
        : Math.max(ready, schedule.firstDeparture);
    this.revision++;
  }
  protectedEdges() {
    const result = new Set(
      this.dispatch.reservations
        .filter((r) => r.resource.startsWith('block:'))
        .map((r) => r.resource.slice(6)),
    );
    for (const t of this.trains) {
      if (t.motion.started || t.distance > 0) result.add(this.track(t).id);
      let rear = consistLength(t.cars) - t.distance;
      for (const leg of [...t.motion.history].reverse()) {
        if (rear <= 0) break;
        result.add(leg.edge);
        rear -= leg.length;
      }
    }
    return result;
  }
  private worksiteReason(nodes: number[], parent?: string) {
    if (
      parent &&
      (this.occupied.has(edgeAt(this.network, parent).block) ||
        this.protectedEdges().has(parent))
    )
      return 'The parent corridor is occupied. Wait for it to clear.';
    for (const t of this.trains) {
      if (t.distance === 0) continue;
      const [a, b] = this.endpoints(t),
        edge = this.track(t),
        clearance = 5.3 + t.cars * 3;
      if (
        (nodes.includes(a) && t.distance < clearance + 3) ||
        (nodes.includes(b) && edge.length - t.distance < clearance + 3)
      )
        return `${locomotives[t.id].name} is inside the turnout work area. Wait for clearance.`;
    }
    return undefined;
  }
  quote(input: Construction) {
    const quote = quoteConstruction(this.network, input);
    if (quote.edge) {
      const reason = this.worksiteReason(
        [quote.edge.a, quote.edge.b],
        input.kind === 'loop' ? input.parent : undefined,
      );
      if (reason) quote.errors.push(reason);
    }
    if (quote.cost.total > this.treasury)
      quote.errors.push('Insufficient funds for this construction.');
    return quote;
  }
  build(input: Construction) {
    const q = this.quote(input);
    if (q.errors.length || !q.edge)
      throw new Error(q.errors.join(' ') || 'Invalid construction.');
    if (q.node) {
      this.network.nodes.push(q.node);
      this.network.nextNode++;
    }
    if (q.station) {
      this.network.stations.push(q.station);
      this.network.nextPlatform++;
    }
    this.network.edges.push(q.edge);
    this.network.nextEdge++;
    this.treasury -= q.cost.total;
    this.construction.push({
      id: this.construction.length + 1,
      action: 'build',
      edge: q.edge.id,
      station: q.station?.id,
      node: q.node?.id,
      cost: { ...q.cost },
      amount: q.cost.total,
    });
    this.changed();
    return q.edge.id;
  }
  stationCost(node: number) {
    return this.network.stations.some((s) => s.node === node) ? 6500 : 12000;
  }
  addStation(node: number, name: string) {
    const n = nodeAt(this.network, node),
      existing = this.network.stations.find((s) => s.node === node);
    if (!n || !name.trim() || name.trim().length > 40)
      throw new Error(
        'Choose an endpoint and a station name of 1–40 characters.',
      );
    if (existing && existing.platforms.length >= 4)
      throw new Error('This station already has four platforms.');
    const reason = this.worksiteReason([node]);
    if (reason) throw new Error(reason);
    const total = this.stationCost(node);
    if (this.treasury < total)
      throw new Error('Insufficient funds for station work.');
    const platform = `platform-${this.network.nextPlatform++}`;
    const station = existing ?? {
      id: `station-${node}`,
      node,
      name: name.trim(),
      platforms: [],
      built: true,
    };
    station.platforms.push(platform);
    if (!existing) {
      this.network.stations.push(station);
      n.name = station.name;
    }
    this.treasury -= total;
    this.construction.push({
      id: this.construction.length + 1,
      action: existing ? 'platform' : 'station',
      station: station.id,
      platform,
      node,
      cost: { track: 0, earthworks: 0, bridges: 0, station: total, total },
      amount: total,
    });
    this.changed();
  }
  removalReason(id: string) {
    const edge = edgeAt(this.network, id);
    if (!edge) return 'This track no longer exists.';
    if (!edge.built)
      return 'The original railway is protected. Only player-built track can be removed.';
    if (this.protectedEdges().has(id) || this.occupied.has(edge.block))
      return 'A train or its trailing consist occupies this infrastructure.';
    if (this.services.some((s) => s.legs.some((l) => l.edge === id)))
      return 'This track is assigned to a service. Change that service at a station first.';
    if (this.network.edges.some((e) => e.id !== id && e.block === id))
      return 'Remove the attached passing loop first.';
    return undefined;
  }
  bulldoze(id: string) {
    const reason = this.removalReason(id);
    if (reason) throw new Error(reason);
    this.network.edges = this.network.edges.filter((e) => e.id !== id);
    this.construction.push({
      id: this.construction.length + 1,
      action: 'bulldoze',
      edge: id,
      cost: { track: 0, earthworks: 0, bridges: 0, station: 0, total: 0 },
      amount: 0,
    });
    this.changed();
  }
  undoReason(record: ConstructionRecord) {
    if (
      record.reversed ||
      !['build', 'station', 'platform'].includes(record.action)
    )
      return 'This purchase cannot be undone.';
    if (record.used)
      return 'This station work has entered service and can no longer be refunded.';
    if (record.edge) {
      const reason = this.removalReason(record.edge);
      if (reason) return reason;
      if (edgeAt(this.network, record.edge).used)
        return 'This track has entered service. Bulldoze it without a refund after unassigning it.';
    }
    if (record.platform && this.reservation(`platform:${record.platform}`))
      return 'A train has reserved this platform. Wait for rear clearance.';
    if (record.station) {
      const station = this.network.stations.find(
        (s) => s.id === record.station,
      );
      if (!station) return 'This station no longer exists.';
      if (this.services.some((s) => s.stops.includes(station.node)))
        return 'This station is assigned to a service.';
      const reason = this.worksiteReason([station.node]);
      if (reason) return reason;
      if (record.action !== 'platform' && station.platforms.length > 1)
        return 'Undo the additional platform purchases first.';
    }
    if (
      record.node !== undefined &&
      record.action === 'build' &&
      this.network.edges.some(
        (e) =>
          e.id !== record.edge && (e.a === record.node || e.b === record.node),
      )
    )
      return 'Another track depends on this endpoint. Remove it first.';
    if (
      record.node !== undefined &&
      record.action === 'build' &&
      !record.station &&
      this.network.stations.some((s) => s.node === record.node)
    )
      return 'Undo the station purchase at this endpoint first.';
    return undefined;
  }
  undo(id: number) {
    const record = this.construction.find((r) => r.id === id);
    if (!record) throw new Error('Choose a construction purchase.');
    const reason = this.undoReason(record);
    if (reason) throw new Error(reason);
    if (record.edge)
      this.network.edges = this.network.edges.filter(
        (e) => e.id !== record.edge,
      );
    if (record.station) {
      const station = this.network.stations.find(
        (s) => s.id === record.station,
      )!;
      if (record.action === 'platform')
        station.platforms = station.platforms.filter(
          (p) => p !== record.platform,
        );
      else
        this.network.stations = this.network.stations.filter(
          (s) => s.id !== record.station,
        );
    }
    if (record.node !== undefined && record.action === 'build')
      this.network.nodes = this.network.nodes.filter(
        (n) => n.id !== record.node,
      );
    this.treasury += record.amount;
    record.reversed = true;
    this.construction.push({
      id: this.construction.length + 1,
      action: 'undo',
      undoOf: record.id,
      edge: record.edge,
      station: record.station,
      cost: { ...record.cost },
      amount: -record.amount,
    });
    this.changed();
  }
  private changed() {
    this.dispatch.lastDepartures = Object.fromEntries(
      Object.entries(this.dispatch.lastDepartures).filter(([key]) =>
        this.network.edges.some(
          (e) => key === `${e.id}:${e.a}` || key === `${e.id}:${e.b}`,
        ),
      ),
    );
    this.lengths = new Map(this.network.edges.map((e) => [e.id, e.length]));
    this.revision++;
  }
  save(): SaveState {
    return structuredClone({
      version: 3,
      dispatch: this.dispatch,
      elapsed: this.elapsed,
      accumulator: this.accumulator,
      treasury: this.treasury,
      delivered: this.delivered,
      trains: this.trains,
      network: this.network,
      services: this.services,
      construction: this.construction,
    });
  }
  restore(value: unknown) {
    // Validate a detached candidate; malformed saves cannot change the live world or treasury.
    const raw = value as SaveState;
    if (!raw || ![1, 2, 3].includes(raw.version))
      throw new Error('This save version is not compatible.');
    const candidate = new Simulation();
    const s = structuredClone(raw);
    if (raw.version >= 2) {
      validateNetwork(s.network);
      candidate.network = s.network;
      if (
        !Array.isArray(s.services) ||
        s.services.length !== locomotives.length
      )
        throw new Error('Invalid service roster.');
      s.services.forEach((service, i) =>
        validateService(s.network, service, i),
      );
      candidate.services = s.services;
      if (!Array.isArray(s.construction) || s.construction.length > 10000)
        throw new Error('Invalid construction history.');
      s.construction.forEach((r, i) => {
        if (
          !r ||
          r.id !== i + 1 ||
          !['build', 'station', 'platform', 'bulldoze', 'undo'].includes(
            r.action,
          ) ||
          !Number.isFinite(r.amount) ||
          !validCost(r.cost) ||
          Math.abs(r.amount) !== r.cost.total ||
          (r.action === 'undo' ? r.amount > 0 : r.amount < 0) ||
          (r.reversed !== undefined && typeof r.reversed !== 'boolean') ||
          (r.used !== undefined && typeof r.used !== 'boolean')
        )
          throw new Error('Invalid construction ledger.');
        if (
          (r.edge !== undefined && typeof r.edge !== 'string') ||
          (r.station !== undefined && typeof r.station !== 'string') ||
          (r.node !== undefined && !Number.isInteger(r.node))
        )
          throw new Error('Invalid construction reference.');
      });
      for (const record of s.construction) {
        if (record.action === 'build') {
          const edge = edgeAt(s.network, record.edge ?? '');
          if (
            !record.edge ||
            record.cost.track <= 0 ||
            (edge && JSON.stringify(record.cost) !== JSON.stringify(edge.cost))
          )
            throw new Error(
              'Construction cost does not match the purchased track.',
            );
          if (
            !edge &&
            !record.reversed &&
            !s.construction.some(
              (r) => r.action === 'bulldoze' && r.edge === record.edge,
            )
          )
            throw new Error('Purchased track is missing.');
          if (
            record.node !== undefined &&
            edge &&
            edge.a !== record.node &&
            edge.b !== record.node
          )
            throw new Error('Construction endpoint does not match its track.');
          if (
            record.station !== undefined &&
            record.station !== `station-${record.node}`
          )
            throw new Error(
              'Construction station does not match its endpoint.',
            );
        }
        if (record.action === 'station' || record.action === 'platform') {
          if (
            record.cost.station !==
              (record.action === 'station' ? 12000 : 6500) ||
            record.cost.total !== record.cost.station ||
            !record.platform ||
            record.station !== `station-${record.node}`
          )
            throw new Error('Invalid station purchase.');
          const station = s.network.stations.find(
            (st) => st.id === record.station,
          );
          if (
            !record.reversed &&
            (!station || !station.platforms.includes(record.platform))
          )
            throw new Error('Purchased platform is missing.');
        }
        if (record.action === 'undo') {
          const original = s.construction.find((r) => r.id === record.undoOf);
          if (
            !original ||
            original.id >= record.id ||
            !original.reversed ||
            !['build', 'station', 'platform'].includes(original.action) ||
            original.amount !== -record.amount ||
            original.edge !== record.edge ||
            original.station !== record.station
          )
            throw new Error('Invalid construction refund.');
        }
        if (
          record.reversed &&
          s.construction.filter((r) => r.undoOf === record.id).length !== 1
        )
          throw new Error('A reversed purchase needs exactly one refund.');
      }
      for (const edge of s.network.edges.filter((e) => e.built))
        if (
          s.construction.filter(
            (r) => r.action === 'build' && r.edge === edge.id && !r.reversed,
          ).length !== 1
        )
          throw new Error('Track purchase is missing from the ledger.');
      candidate.construction = s.construction;
      if (
        !Number.isFinite(s.accumulator) ||
        s.accumulator < 0 ||
        s.accumulator >= 0.05 + 1e-9
      )
        throw new Error('Invalid simulation clock.');
      candidate.accumulator = s.accumulator;
    }
    if (
      ![s.elapsed, s.treasury, s.delivered].every(
        (n) => Number.isFinite(n) && n >= 0,
      ) ||
      !Array.isArray(s.trains) ||
      s.trains.length !== locomotives.length
    )
      throw new Error('This save is not compatible.');
    const occupancy = new Map<string, number>();
    s.trains.forEach((t, i) => {
      const legs = candidate.services[i].legs;
      if (
        !t ||
        t.id !== i ||
        !Number.isInteger(t.leg) ||
        t.leg < 0 ||
        t.leg >= legs.length ||
        !Number.isInteger(t.cars) ||
        t.cars < 3 ||
        t.cars > 6 ||
        typeof t.held !== 'boolean' ||
        !['Running', 'At station', 'At signal', 'On hold'].includes(t.status) ||
        ![t.distance, t.dwell, t.delivered, t.revenue, t.load].every(
          (n) => Number.isFinite(n) && n >= 0,
        ) ||
        t.load > 100 ||
        t.dwell > 60 ||
        (t.stopAtStation !== undefined && typeof t.stopAtStation !== 'boolean')
      )
        throw new Error('Invalid train in save.');
      const edge = edgeAt(candidate.network, legs[t.leg].edge);
      if (t.distance >= edge.length) throw new Error('Invalid train position.');
      if (t.distance > 0) {
        if (occupancy.has(edge.id))
          throw new Error('Conflicting track reservations in save.');
        occupancy.set(edge.id, i);
      }
    });
    candidate.trains = s.trains;
    candidate.elapsed = s.elapsed;
    candidate.dispatch =
      raw.version === 3
        ? s.dispatch
        : { reservations: [], lastDepartures: {}, overrides: [] };
    if (raw.version !== 3) {
      for (const t of candidate.trains) {
        t.motion = newMotion();
        if (t.distance > 0) {
          t.motion.started = true;
          candidate.claim(`block:${candidate.track(t).id}`, t);
          if (t.distance < consistLength(t.cars) + TURNOUT_CLEARANCE)
            candidate.claim(
              `junction:${candidate.endpoints(t)[0]}`,
              t,
              consistLength(t.cars) + TURNOUT_CLEARANCE - t.distance,
            );
          if (candidate.track(t).length - t.distance < TURNOUT_CLEARANCE) {
            candidate.claim(`junction:${candidate.endpoints(t)[1]}`, t);
            const platform = candidate.platform(t, candidate.endpoints(t)[1]);
            if (platform) candidate.claim(`platform:${platform}`, t);
          }
        }
      }
    }
    validateMotion(candidate);
    candidate.releaseCleared();
    candidate.elapsed = s.elapsed;
    candidate.treasury = s.treasury;
    candidate.delivered = s.delivered;
    this.network = candidate.network;
    this.services = candidate.services;
    this.construction = candidate.construction;
    this.trains = candidate.trains;
    this.elapsed = candidate.elapsed;
    this.treasury = candidate.treasury;
    this.delivered = candidate.delivered;
    this.accumulator = candidate.accumulator;
    this.dispatch = candidate.dispatch;
    this.occupied = candidate.occupied;
    this.changed();
    this.events = ['Local railway save restored.'];
  }
}
function validCost(cost: Cost) {
  return (
    cost &&
    [cost.track, cost.earthworks, cost.bridges, cost.station, cost.total].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) &&
    cost.total === cost.track + cost.earthworks + cost.bridges + cost.station
  );
}
function validateNetwork(n: RailNetwork) {
  if (
    !n ||
    !Array.isArray(n.nodes) ||
    !Array.isArray(n.edges) ||
    !Array.isArray(n.stations) ||
    n.nodes.length < 8 ||
    n.nodes.length > 256 ||
    n.edges.length < 13 ||
    n.edges.length > 512
  )
    throw new Error('Invalid saved network.');
  const ids = new Set<number>(),
    edges = new Set<string>(),
    platforms = new Set<string>(),
    stations = new Set<string>();
  for (const node of n.nodes) {
    if (
      !node ||
      !Number.isSafeInteger(node.id) ||
      node.id < 0 ||
      ids.has(node.id) ||
      ![node.x, node.y, node.z].every(Number.isFinite) ||
      Math.abs(node.x) > 100 ||
      Math.abs(node.z) > 100 ||
      node.y < 0 ||
      node.y > 40 ||
      typeof node.name !== 'string' ||
      !node.name.trim() ||
      node.name.length > 48 ||
      typeof node.cargo !== 'string'
    )
      throw new Error('Invalid network endpoint.');
    ids.add(node.id);
  }
  for (const edge of n.edges) {
    if (
      !edge ||
      typeof edge.id !== 'string' ||
      !edge.id ||
      edges.has(edge.id) ||
      !ids.has(edge.a) ||
      !ids.has(edge.b) ||
      edge.a === edge.b ||
      typeof edge.block !== 'string' ||
      (edge.direction !== undefined &&
        !['both', 'a-to-b', 'b-to-a'].includes(edge.direction)) ||
      !['track', 'siding', 'loop'].includes(edge.kind) ||
      typeof edge.built !== 'boolean' ||
      typeof edge.used !== 'boolean' ||
      !validCost(edge.cost) ||
      !Array.isArray(edge.points) ||
      edge.points.length < 2 ||
      edge.points.length > 2000 ||
      edge.points.some(
        (p) =>
          !p ||
          ![p.x, p.y, p.z].every(Number.isFinite) ||
          Math.abs(p.x) > 100 ||
          Math.abs(p.z) > 100 ||
          p.y < 0 ||
          p.y > 40,
      )
    )
      throw new Error('Invalid track in save.');
    let length = 0;
    for (let i = 1; i < edge.points.length; i++)
      length += Math.hypot(
        edge.points[i].x - edge.points[i - 1].x,
        edge.points[i].y - edge.points[i - 1].y,
        edge.points[i].z - edge.points[i - 1].z,
      );
    const a = nodeAt(n, edge.a),
      b = nodeAt(n, edge.b),
      first = edge.points[0],
      last = edge.points[edge.points.length - 1];
    if (
      !Number.isFinite(edge.length) ||
      Math.abs(length - edge.length) > 1e-6 ||
      length < 1 ||
      length > 300 ||
      [
        first.x - a.x,
        first.y - a.y,
        first.z - a.z,
        last.x - b.x,
        last.y - b.y,
        last.z - b.z,
      ].some((v) => Math.abs(v) > 1e-6) ||
      ![edge.grade, edge.radius, edge.bridgeLength].every(
        (v) => Number.isFinite(v) && v >= 0,
      )
    )
      throw new Error('Invalid saved track geometry.');
    const measured = measure(edge.points);
    if (
      Math.abs(edge.grade - measured.grade) > 1e-8 ||
      Math.abs(edge.radius - measured.radius) > 1e-5 ||
      Math.abs(edge.bridgeLength - measured.bridgeLength) > 1e-6 ||
      (edge.built && (edge.grade > 0.04 || edge.radius < 10))
    )
      throw new Error('Invalid saved track constraints.');
    edges.add(edge.id);
  }
  for (const e of n.edges)
    if (
      e.kind === 'loop'
        ? !n.edges.some(
            (p) =>
              p.id === e.block &&
              p.kind === 'track' &&
              p.a === e.a &&
              p.b === e.b,
          )
        : e.block !== e.id
    )
      throw new Error('Invalid corridor reservation group.');
  for (const s of n.stations) {
    if (
      !s ||
      s.id !== `station-${s.node}` ||
      stations.has(s.id) ||
      !ids.has(s.node) ||
      typeof s.name !== 'string' ||
      !s.name.trim() ||
      s.name.length > 40 ||
      typeof s.built !== 'boolean' ||
      !Array.isArray(s.platforms) ||
      s.platforms.length < 1 ||
      s.platforms.length > 4
    )
      throw new Error('Invalid station.');
    stations.add(s.id);
    for (const p of s.platforms) {
      if (
        typeof p !== 'string' ||
        !/^platform-\d+$/.test(p) ||
        platforms.has(p)
      )
        throw new Error('Invalid platform.');
      platforms.add(p);
    }
  }
  const baseline = createNetwork();
  if (
    baseline.nodes.some((b) => {
      const a = nodeAt(n, b.id);
      return !a || a.x !== b.x || a.y !== b.y || a.z !== b.z;
    }) ||
    baseline.edges.some((b) => {
      const e = edgeAt(n, b.id);
      return (
        !e ||
        e.built ||
        e.kind !== 'track' ||
        e.a !== b.a ||
        e.b !== b.b ||
        JSON.stringify(e.points) !== JSON.stringify(b.points)
      );
    }) ||
    baseline.stations.some(
      (b) => !n.stations.some((s) => s.id === b.id && !s.built),
    )
  )
    throw new Error('The original railway is missing or modified.');
  if (
    !Number.isSafeInteger(n.nextNode) ||
    n.nextNode <= Math.max(...ids) ||
    !Number.isSafeInteger(n.nextEdge) ||
    n.nextEdge < 1 ||
    n.edges.some(
      (e) =>
        e.built &&
        (!/^track-\d+$/.test(e.id) || Number(e.id.slice(6)) >= n.nextEdge),
    ) ||
    !Number.isSafeInteger(n.nextPlatform) ||
    n.nextPlatform <= Math.max(...[...platforms].map((p) => Number(p.slice(9))))
  )
    throw new Error('Invalid network ID counters.');
}
function validateService(network: RailNetwork, s: Service, id: number) {
  if (
    !s ||
    s.id !== `service-${id}` ||
    s.trainId !== id ||
    typeof s.name !== 'string' ||
    !s.name.trim() ||
    s.name.length > 48 ||
    !Array.isArray(s.stops) ||
    s.stops.length < 2 ||
    s.stops.length > 16 ||
    new Set(s.stops).size !== s.stops.length ||
    s.stops.some((n) => !network.stations.some((st) => st.node === n)) ||
    !Number.isFinite(s.dwell) ||
    s.dwell < 1 ||
    s.dwell > 60 ||
    !Array.isArray(s.legs) ||
    s.legs.length < 2 ||
    s.legs.length > 1024
  )
    throw new Error('Invalid service.');
  if (s.dispatch) validateDispatch(network, s.dispatch);
  s.legs.forEach((leg: RouteLeg, i) => {
    const edge = edgeAt(network, leg?.edge),
      next = s.legs[(i + 1) % s.legs.length];
    if (
      !edge ||
      !next ||
      !(
        (edge.a === leg.from && edge.b === leg.to) ||
        (edge.b === leg.from && edge.a === leg.to)
      ) ||
      leg.to !== next.from
    )
      throw new Error('Disconnected service itinerary.');
  });
  if (s.legs[0].from !== s.stops[0])
    throw new Error('Invalid first service stop.');
  const arrivals = s.legs.filter((leg) => leg.stop).map((leg) => leg.to);
  const expected = [...s.stops.slice(1), s.stops[0]];
  if (
    s.legs.some((leg) => typeof leg.stop !== 'boolean') ||
    JSON.stringify(arrivals) !== JSON.stringify(expected)
  )
    throw new Error('Service does not visit its ordered stops.');
}

function validateDispatch(network: RailNetwork, settings: DispatchSettings) {
  if (
    !settings ||
    !['passenger', 'freight'].includes(settings.priority) ||
    !Number.isFinite(settings.firstDeparture) ||
    settings.firstDeparture < 0 ||
    settings.firstDeparture > 1e9 ||
    !Number.isFinite(settings.interval) ||
    settings.interval < 0 ||
    settings.interval > 3600 ||
    !Number.isFinite(settings.headway) ||
    settings.headway < 0 ||
    settings.headway > 300 ||
    !settings.platforms ||
    typeof settings.platforms !== 'object' ||
    Array.isArray(settings.platforms)
  )
    throw new Error(
      'Use a valid priority, departure time, interval (0–3600 s) and headway (0–300 s).',
    );
  for (const [node, platform] of Object.entries(settings.platforms))
    if (
      !network.stations.some(
        (s) => String(s.node) === node && s.platforms.includes(platform),
      )
    )
      throw new Error('The preferred platform must belong to its station.');
}
function validateMotion(sim: Simulation) {
  const d = sim.dispatch;
  if (
    !d ||
    !Array.isArray(d.reservations) ||
    d.reservations.length > 4096 ||
    !Array.isArray(d.overrides) ||
    new Set(d.overrides).size !== d.overrides.length ||
    d.overrides.some((id) => !Number.isInteger(id) || !sim.trains[id]) ||
    !d.lastDepartures ||
    typeof d.lastDepartures !== 'object' ||
    Array.isArray(d.lastDepartures)
  )
    throw new Error('Invalid dispatcher state.');
  const resources = new Set<string>();
  for (const e of sim.network.edges) resources.add(`block:${e.id}`);
  for (const n of sim.network.nodes) resources.add(`junction:${n.id}`);
  for (const s of sim.network.stations)
    for (const p of s.platforms) resources.add(`platform:${p}`);
  const owned = new Set<string>();
  for (const r of d.reservations) {
    if (
      !r ||
      !resources.has(r.resource) ||
      owned.has(r.resource) ||
      !Number.isInteger(r.owner) ||
      !sim.trains[r.owner] ||
      (r.releaseAt !== null &&
        (!Number.isFinite(r.releaseAt) ||
          r.releaseAt <= sim.trains[r.owner].motion.travelled))
    )
      throw new Error('Invalid or conflicting dispatch reservation.');
    owned.add(r.resource);
  }
  for (const [key, time] of Object.entries(d.lastDepartures))
    if (
      !sim.network.edges.some(
        (e) => key === `${e.id}:${e.a}` || key === `${e.id}:${e.b}`,
      ) ||
      !Number.isFinite(time) ||
      time < 0 ||
      time > sim.elapsed + 1e-8
    )
      throw new Error('Invalid headway clock.');
  for (const t of sim.trains) {
    const m = t.motion;
    if (
      !m ||
      ![
        m.velocity,
        m.travelled,
        m.departureDue,
        m.lateness,
        m.departures,
        m.onTime,
        m.calls,
      ].every((n) => Number.isFinite(n) && n >= 0) ||
      m.velocity > locomotives[t.id].speed * 0.25 + 1e-6 ||
      m.onTime > m.departures ||
      ![m.departures, m.onTime, m.calls].every(Number.isSafeInteger) ||
      typeof m.started !== 'boolean' ||
      typeof m.reversed !== 'boolean' ||
      (m.waitingSince !== null &&
        (!Number.isFinite(m.waitingSince) || m.waitingSince < 0)) ||
      !Array.isArray(m.history) ||
      m.history.length > 400 ||
      (!m.started && (m.velocity !== 0 || t.distance !== 0))
    )
      throw new Error('Invalid train motion.');
    if (
      m.wait &&
      (![
        'block',
        'junction',
        'platform',
        'departure',
        'headway',
        'direction',
        'hold',
      ].includes(m.wait.kind) ||
        typeof m.wait.message !== 'string' ||
        m.wait.message.length > 300 ||
        (m.wait.owner !== undefined &&
          (!Number.isInteger(m.wait.owner) ||
            !sim.trains[m.wait.owner] ||
            m.wait.owner === t.id)) ||
        (m.wait.resource !== undefined && !resources.has(m.wait.resource)))
    )
      throw new Error('Invalid waiting reason.');
    m.history.forEach((leg, i) => {
      const edge = edgeAt(sim.network, leg?.edge);
      if (
        !edge ||
        leg.length !== edge.length ||
        !(
          (edge.a === leg.from && edge.b === leg.to) ||
          (edge.b === leg.from && edge.a === leg.to)
        ) ||
        (i > 0 && m.history[i - 1].to !== leg.from)
      )
        throw new Error('Invalid travelled path.');
    });
    if (m.history.length && m.history.at(-1)!.to !== sim.endpoints(t)[0])
      throw new Error('Travelled path does not reach the train.');
    const requireBlock = (edge: string) => {
      if (
        !d.reservations.some(
          (r) => r.resource === `block:${edge}` && r.owner === t.id,
        )
      )
        throw new Error('Missing full-consist reservation.');
    };
    if (m.started) {
      requireBlock(sim.track(t).id);
      if (
        d.reservations.find((r) => r.resource === `block:${sim.track(t).id}`)!
          .releaseAt !== null
      )
        throw new Error('An active block cannot expire before arrival.');
    }
    const [from, to] = sim.endpoints(t);
    const requireJunction = (node: number, clearance: number) => {
      const r = d.reservations.find(
        (r) => r.resource === `junction:${node}` && r.owner === t.id,
      );
      if (
        !r ||
        (r.releaseAt !== null && r.releaseAt + 1e-8 < m.travelled + clearance)
      )
        throw new Error('Missing turnout clearance reservation.');
    };
    if (m.started && t.distance < consistLength(t.cars) + TURNOUT_CLEARANCE)
      requireJunction(
        from,
        consistLength(t.cars) + TURNOUT_CLEARANCE - t.distance,
      );
    if (
      m.started &&
      sim.track(t).length - t.distance < TURNOUT_CLEARANCE - 1e-6
    )
      requireJunction(to, 0);
    if (!m.started && m.history.length) {
      requireJunction(from, 0);
      const station = sim.network.stations.find((s) => s.node === from);
      if (
        station &&
        !station.platforms.some((p) =>
          d.reservations.some(
            (r) => r.resource === `platform:${p}` && r.owner === t.id,
          ),
        )
      )
        throw new Error('Missing occupied platform reservation.');
    }
    let rear = consistLength(t.cars) - t.distance;
    for (const leg of [...m.history].reverse()) {
      if (rear <= 1e-8) break;
      requireBlock(leg.edge);
      const reservation = d.reservations.find(
        (r) => r.resource === `block:${leg.edge}`,
      )!;
      if (
        reservation.releaseAt !== null &&
        reservation.releaseAt + 1e-8 < m.travelled + rear
      )
        throw new Error('Rear reservation expires too soon.');
      rear -= leg.length;
    }
  }
}
