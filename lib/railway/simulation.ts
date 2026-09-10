import {
  createEconomy,
  tickEconomy,
  journal,
  pay,
  validateEconomy,
  type EconomyState,
} from './economy';
import { MAP } from './map';
import { Traffic } from './traffic';
import { Topology, chooseYard, sample } from './topology';
import {
  circularWaits,
  consistLength,
  defaultDispatch,
  newMotion,
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
  parallelPoints,
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
  action: 'build' | 'station' | 'platform' | 'bulldoze' | 'undo' | 'crossover';
  crossover?: string;
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
  version: 6;
  economy: EconomyState;
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
    planService(
      this.network,
      id,
      `${l.name} service`,
      id === 3 ? [0, 4] : id === 4 ? [3, 4] : l.route,
      3.5,
    ),
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
    load: 0,
    motion: { ...newMotion(), departureDue: id * 0.8 },
  }));
  treasury = 425000;
  economy = createEconomy(
    this.network.stations.map((s) => s.node),
    locomotives.length,
  );
  constructor() {
    this.economy.ledger.push({
      id: 1,
      at: 0,
      category: 'opening',
      amount: this.treasury,
      balance: this.treasury,
      debt: 0,
      note: 'Opening capital',
    });
  }
  canAfford(amount: number) {
    return this.economy.mode === 'unlimited' || this.treasury >= amount;
  }
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
      if (this.accumulator < 1e-10) this.accumulator = 0;
      this.elapsed += 0.05;
      tickEconomy(this);
      this.releaseCleared();
      const order = [...this.trains].sort(
        (a, b) => this.dispatchRank(b) - this.dispatchRank(a) || a.id - b.id,
      );
      this.traffic.beginTick();
      for (const t of order) this.moveTrain(t);
      this.traffic.recoverWaits();
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
        3600,
        (this.elapsed - (t.motion.waitingSince ?? this.elapsed)) / 2,
      ) +
      Math.min(3600, this.elapsed - t.motion.physical.lastCallAt)
    );
  }
  private reservation(resource: string) {
    return this.dispatch.reservations.find((r) => r.resource === resource);
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
  topology = new Topology(this.network);
  traffic = new Traffic(this);
  private moveTrain(t: TrainState) {
    this.traffic.move(t);
  }
  vehiclePosition(t: TrainState, offset: number) {
    return this.traffic.pose(t, offset);
  }
  visible(t: TrainState) {
    return this.traffic.visible(t);
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
    if (
      this.protectedEdges().has(id) ||
      this.reservation(`block:${id}`) ||
      this.trains.some((t) =>
        t.motion.physical.route?.legs.some((l) => l.edge === id),
      )
    )
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
  useCrossover(id: number, crossover: string) {
    const t = this.trains[id],
      p = t?.motion.physical;
    if (
      !t ||
      !p ||
      t.motion.started ||
      !this.network.crossovers?.some((c) => c.id === crossover)
    )
      throw new Error('Select a crossover before departure.');
    p.requestedCrossover = crossover;
    p.retryAt = 0;
    this.prioritize(id);
  }
  canTurnBack(id: number) {
    return !!this.trains[id] && this.traffic.canTurnBack(this.trains[id]);
  }
  turnBack(id: number) {
    this.traffic.turnBack(this.trains[id]);
    this.revision++;
  }
  resourceLabel(resource: string): string {
    const edgeId = resource.startsWith('block:')
      ? resource.slice(6)
      : undefined;
    const edge = edgeId ? edgeAt(this.network, edgeId) : undefined;
    if (edge)
      return `${nodeAt(this.network, edge.a).name} ↔ ${nodeAt(this.network, edge.b).name} · ${edge.kind === 'parallel' ? 'second line' : 'main line'}`;
    const platform = resource.startsWith('platform:')
      ? resource.slice(9)
      : resource.startsWith('section:platform-')
        ? resource.slice(8)
        : undefined;
    if (platform) {
      const station = this.network.stations.find((s) =>
        s.platforms.includes(platform),
      );
      if (station)
        return `${station.name} · platform ${station.platforms.indexOf(platform) + 1}`;
    }
    if (resource.startsWith('section:arrival:'))
      return `Arrival throat · ${this.resourceLabel(`platform:${resource.slice(16)}`)}`;
    if (resource.startsWith('section:departure:'))
      return `Return loop · ${this.resourceLabel(`platform:${resource.slice(18)}`)}`;
    if (resource.startsWith('zone:')) return 'Protected crossing / turnout';
    if (resource.startsWith('section:turnout:'))
      return 'Reserved station approach';
    if (resource.startsWith('section:crossover-')) return 'Reserved crossover';
    return resource;
  }
  dispatcherSnapshot() {
    const waits = this.trains
      .filter((t) => t.motion.wait)
      .map((t) => ({
        id: t.id,
        ...t.motion.wait!,
        owners: t.motion.physical.blockers,
        seconds: this.elapsed - (t.motion.waitingSince ?? this.elapsed),
      }));
    const departures = this.trains.reduce((n, t) => n + t.motion.departures, 0),
      onTime = this.trains.reduce((n, t) => n + t.motion.onTime, 0);
    return {
      waits,
      cycles: circularWaits(waits),
      reservations: this.dispatch.reservations,
      queued: this.trains.filter((t) => !this.visible(t)).length,
      physical: this.traffic.allEnvelopes(),
      zones: this.topology.zones,
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
      !this.canAfford(8500) ||
      t.motion.started ||
      t.motion.reversed ||
      !this.traffic.canAddCar(t)
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
    this.traffic.refreshProtection();
    pay(this, 8500, 'wagon', 'Additional wagon', id);
    t.load = Math.round(
      ((this.economy.services[id].manifest?.quantity ?? 0) / (t.cars * 18)) *
        100,
    );
    return true;
  }
  stopForEditing(id: number) {
    const t = this.trains[id];
    if (!t) throw new Error('Choose a train.');
    if (
      !t.motion.started &&
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
      t.motion.started ||
      !this.network.stations.some((s) => s.node === this.endpoints(t)[0])
    )
      throw new Error(
        'Stop this train at a station before changing its service.',
      );
    if (this.economy.services[t.id].manifest)
      throw new Error('Deliver the cargo aboard before changing the service.');
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
    return new Set(
      this.dispatch.reservations
        .filter((r) => r.resource.startsWith('block:'))
        .map((r) => r.resource.slice(6)),
    );
  }
  private worksiteReason(nodes: number[], parent?: string) {
    for (const t of this.trains) {
      const route = t.motion.physical.route;
      if (
        route &&
        route.legs.some((l) => nodes.includes(l.from) || nodes.includes(l.to))
      )
        return `${locomotives[t.id].name} has a protected route through this turnout work area. Wait for clearance.`;
    }

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
        ['loop', 'parallel'].includes(input.kind) ? input.parent : undefined,
      );
      if (reason) quote.errors.push(reason);
      if (
        this.traffic
          .allEnvelopes()
          .some((vehicle) =>
            quote.edge!.points.some(
              (p) =>
                Math.abs(p.y - vehicle.p.y) < 3.1 &&
                Math.hypot(p.x - vehicle.p.x, p.z - vehicle.p.z) < 4,
            ),
          )
      )
        quote.errors.push(
          'A vehicle occupies the construction clearance area. Wait for the complete train to clear.',
        );
    }
    if (quote.station && quote.edge) {
      try {
        Object.assign(
          quote.station,
          chooseYard(
            {
              ...this.network,
              nodes: [
                ...this.network.nodes,
                ...(quote.node ? [quote.node] : []),
              ],
              edges: [...this.network.edges, quote.edge],
            },
            quote.station.node,
          ),
        );
      } catch (error) {
        quote.errors.push((error as Error).message);
      }
    }
    if (!this.canAfford(quote.cost.total))
      quote.errors.push('Insufficient funds for this construction.');
    return quote;
  }
  private verifyWorksite(network: RailNetwork) {
    const proposed = new Topology(network, false);
    const bodies = this.traffic.allEnvelopes();
    for (const section of proposed.sections.values()) {
      if (this.topology.sections.has(section.id)) continue;
      if (
        section.points.some(
          (p) =>
            Math.abs(p.x) >= MAP.halfWidth - 1 ||
            Math.abs(p.z) >= MAP.halfDepth - 1,
        )
      )
        throw new Error(
          'The station approach or return loop extends outside the valley. Choose an endpoint with more room.',
        );
      const workPoints = Array.from(
        { length: Math.ceil(section.length) + 1 },
        (_, i) => sample(section, Math.min(i, section.length)).p,
      );
      if (
        bodies.some((body) =>
          workPoints.some(
            (p) =>
              Math.abs(p.y - body.p.y) < 3.1 &&
              Math.hypot(p.x - body.p.x, p.z - body.p.z) < 4,
          ),
        )
      )
        throw new Error(
          'A vehicle occupies the new platform or turnout work area. Wait for clearance.',
        );
    }
  }
  build(input: Construction) {
    const q = this.quote(input);
    if (q.errors.length || !q.edge)
      throw new Error(q.errors.join(' ') || 'Invalid construction.');
    this.verifyWorksite({
      ...this.network,
      nodes: [...this.network.nodes, ...(q.node ? [q.node] : [])],
      edges: [...this.network.edges, q.edge],
      stations: [...this.network.stations, ...(q.station ? [q.station] : [])],
    });
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
    pay(this, q.cost.total, 'construction', 'Track construction');
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
  quoteCrossover(parallel: string, position = 0.5) {
    const line = edgeAt(this.network, parallel),
      main = line && edgeAt(this.network, line.block);
    const errors: string[] = [];
    if (line?.kind !== 'parallel' || !main)
      return {
        errors: ['Choose a purchased parallel running line.'],
        cost: undefined,
      };
    if (!Number.isFinite(position) || position < 0.4 || position > 0.6)
      errors.push('Place a crossover between 40% and 60% of the corridor.');
    if (
      this.network.crossovers?.some(
        (c) => c.main === main.id || c.parallel === parallel,
      )
    )
      errors.push('This corridor already has a crossover.');
    if (
      this.protectedEdges().has(main.id) ||
      this.protectedEdges().has(parallel) ||
      this.worksiteReason([main.a, main.b])
    )
      errors.push(
        'Wait for both running lines and station movements to clear.',
      );
    const proposal = structuredClone(this.network);
    proposal.crossovers = [
      ...(proposal.crossovers ?? []),
      {
        id: 'crossover-preview',
        main: main.id,
        parallel,
        position: Math.max(
          0.4,
          Math.min(0.6, Number.isFinite(position) ? position : 0.5),
        ),
        cost: { track: 0, earthworks: 0, bridges: 0, station: 0, total: 0 },
      },
    ];
    const geometry = new Topology(proposal, false).sections.get(
      'crossover-preview',
    )!;
    const metrics = measure(geometry.points);
    const cost = {
      track: Math.ceil(5000 + metrics.length * 220),
      earthworks: Math.ceil(metrics.earthworks * 90),
      bridges: Math.ceil(metrics.bridgeLength * 1100),
      station: 0,
      total: 0,
    };
    cost.total = cost.track + cost.earthworks + cost.bridges;
    if (metrics.radius < 10)
      errors.push(
        'This corridor is too short for a fleet-safe crossover lead.',
      );
    if (!this.canAfford(cost.total))
      errors.push('Insufficient funds for crossover work.');
    return { errors, cost };
  }
  buildCrossover(parallel: string, position = 0.5) {
    const quote = this.quoteCrossover(parallel, position);
    if (quote.errors.length || !quote.cost)
      throw new Error(quote.errors.join(' '));
    const line = edgeAt(this.network, parallel),
      id = `crossover-${this.construction.length + 1}`;
    this.network.crossovers ??= [];
    this.network.crossovers.push({
      id,
      main: line.block,
      parallel,
      position,
      cost: quote.cost,
    });
    pay(this, quote.cost.total, 'construction', 'Crossover construction');
    this.construction.push({
      id: this.construction.length + 1,
      action: 'crossover',
      crossover: id,
      cost: quote.cost,
      amount: quote.cost.total,
    });
    this.changed();
    return id;
  }
  crossoverRemovalReason(id: string) {
    const cross = this.network.crossovers?.find((c) => c.id === id);
    if (!cross) return 'This crossover no longer exists.';
    const main = edgeAt(this.network, cross.main);
    if (
      this.protectedEdges().has(cross.main) ||
      this.protectedEdges().has(cross.parallel) ||
      this.worksiteReason([main.a, main.b])
    )
      return 'Wait for both running lines and their protected movements to clear.';
    if (this.trains.some((t) => t.motion.physical.requestedCrossover === id))
      return 'Cancel the requested crossover route before removing this connection.';
    return undefined;
  }
  bulldozeCrossover(id: string) {
    const reason = this.crossoverRemovalReason(id);
    if (reason) throw new Error(reason);
    this.network.crossovers = this.network.crossovers!.filter(
      (c) => c.id !== id,
    );
    this.construction.push({
      id: this.construction.length + 1,
      action: 'bulldoze',
      crossover: id,
      cost: { track: 0, earthworks: 0, bridges: 0, station: 0, total: 0 },
      amount: 0,
    });
    this.changed();
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
    if (!this.canAfford(total))
      throw new Error('Insufficient funds for station work.');
    const placement = existing ? undefined : chooseYard(this.network, node);
    const platform = `platform-${this.network.nextPlatform}`;
    const station = existing ?? {
      id: `station-${node}`,
      node,
      name: name.trim(),
      platforms: [],
      built: true,
      ...placement,
    };
    this.verifyWorksite({
      ...this.network,
      stations: [
        ...this.network.stations.filter((s) => s.id !== station.id),
        { ...station, platforms: [...station.platforms, platform] },
      ],
    });
    this.network.nextPlatform++;
    station.platforms.push(platform);
    if (!existing) {
      this.network.stations.push(station);
      n.name = station.name;
    }
    pay(this, total, 'construction', 'Station and platform construction');
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
    if (
      this.protectedEdges().has(id) ||
      this.occupied.has(edge.block) ||
      this.trains.some((t) =>
        t.motion.physical.route?.legs.some((l) => l.edge === id),
      )
    )
      return 'A train or its trailing consist occupies this infrastructure.';
    if (this.services.some((s) => s.legs.some((l) => l.edge === id)))
      return 'This track is assigned to a service. Change that service at a station first.';
    if (
      this.network.crossovers?.some((c) => c.main === id || c.parallel === id)
    )
      return 'This running line supports a crossover and cannot be removed.';
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
      !['build', 'station', 'platform', 'crossover'].includes(record.action)
    )
      return 'This purchase cannot be undone.';
    if (record.crossover) {
      const reason = this.crossoverRemovalReason(record.crossover);
      if (reason) return reason;
    }
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
    if (record.crossover)
      this.network.crossovers = this.network.crossovers!.filter(
        (c) => c.id !== record.crossover,
      );
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
    if (record.station && record.action !== 'platform') {
      const removed = this.economy.towns.filter(
        (town) =>
          !this.network.stations.some((station) => station.node === town.node),
      );
      for (const town of removed)
        this.economy.consumed.passengers +=
          town.stock.passengers + town.received.passengers;
      this.economy.towns = this.economy.towns.filter(
        (town) => !removed.includes(town),
      );
    }
    if (record.node !== undefined && record.action === 'build')
      this.network.nodes = this.network.nodes.filter(
        (n) => n.id !== record.node,
      );
    journal(
      this,
      'refund',
      record.amount,
      `Construction #${record.id} refunded`,
    );
    record.reversed = true;
    this.construction.push({
      id: this.construction.length + 1,
      action: 'undo',
      undoOf: record.id,
      ...(record.crossover ? { crossover: record.crossover } : {}),
      edge: record.edge,
      station: record.station,
      cost: { ...record.cost },
      amount: -record.amount,
    });
    this.changed();
  }
  private changed(restoring = false) {
    this.topology = new Topology(this.network);
    this.traffic = new Traffic(this);
    if (!restoring) {
      for (const t of this.trains)
        if (
          !t.motion.physical.route &&
          t.motion.history.some((l) => !edgeAt(this.network, l.edge))
        )
          t.motion.history = [];
      this.traffic.refreshProtection();
    }
    if (!restoring) this.trains.forEach((t) => (t.motion.physical.retryAt = 0));
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
      version: 6,
      economy: this.economy,
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
    if (!raw || ![1, 2, 3, 4, 5, 6].includes(raw.version))
      throw new Error('This save version is not compatible.');
    if (raw.version < 5)
      throw new Error(
        'This legacy save uses a different map or physical station layout. The original slot is preserved; start a new railway. No trains were relocated.',
      );
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
          ![
            'build',
            'station',
            'platform',
            'bulldoze',
            'undo',
            'crossover',
          ].includes(r.action) ||
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
        if (record.action === 'crossover') {
          const c = s.network.crossovers?.find(
            (c) => c.id === record.crossover,
          );
          if (
            (c && JSON.stringify(c.cost) !== JSON.stringify(record.cost)) ||
            (!c &&
              !record.reversed &&
              !s.construction.some(
                (r) =>
                  r.action === 'bulldoze' && r.crossover === record.crossover,
              ))
          )
            throw new Error('Invalid crossover purchase.');
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
            !['build', 'station', 'platform', 'crossover'].includes(
              original.action,
            ) ||
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
      for (const cross of s.network.crossovers ?? [])
        if (
          s.construction.filter(
            (r) =>
              r.action === 'crossover' &&
              r.crossover === cross.id &&
              !r.reversed,
          ).length !== 1
        )
          throw new Error('Crossover purchase is missing from the ledger.');
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
      !Number.isSafeInteger(s.treasury) ||
      ![s.elapsed, s.delivered].every((n) => Number.isFinite(n) && n >= 0) ||
      !Array.isArray(s.trains) ||
      s.trains.length !== locomotives.length
    )
      throw new Error('This save is not compatible.');

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
    });
    candidate.trains = s.trains;
    candidate.elapsed = s.elapsed;
    candidate.dispatch = s.dispatch;
    candidate.topology = new Topology(candidate.network);
    candidate.traffic = new Traffic(candidate);
    validateMotion(candidate);
    candidate.traffic.validate();
    candidate.releaseCleared();
    candidate.elapsed = s.elapsed;
    candidate.treasury = s.treasury;
    candidate.delivered = s.delivered;
    if (Number(raw.version) === 5) {
      candidate.economy = createEconomy(
        candidate.network.stations.map((station) => station.node),
        candidate.trains.length,
      );
      candidate.economy.second = Math.floor(candidate.elapsed + 1e-7);
      candidate.economy.billedMinute = Math.floor(
        (candidate.elapsed + 1e-7) / 60,
      );
      candidate.economy.billedDistance = candidate.trains.map(
        (t) => t.motion.travelled,
      );
      candidate.economy.openingRevenue = candidate.trains.map((t) => t.revenue);
      candidate.economy.openingDelivered = candidate.trains.map(
        (t) => t.delivered,
      );
      candidate.economy.ledger = [
        {
          id: 1,
          at: candidate.elapsed,
          category: 'opening',
          amount: candidate.treasury,
          balance: candidate.treasury,
          debt: 0,
          note: 'Version 5 opening balance; historic cargo was not inventoried',
        },
      ];
      candidate.trains.forEach((t) => (t.load = 0));
    } else candidate.economy = s.economy;
    validateEconomy(candidate);
    this.economy = candidate.economy;
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
    this.changed(true);
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
      Math.abs(node.x) > MAP.halfWidth ||
      Math.abs(node.z) > MAP.halfDepth ||
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
      !['track', 'siding', 'loop', 'parallel'].includes(edge.kind) ||
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
          Math.abs(p.x) > MAP.halfWidth ||
          Math.abs(p.z) > MAP.halfDepth ||
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
      length > MAP.maxTrackLength + 100 ||
      ([
        first.x - a.x,
        first.y - a.y,
        first.z - a.z,
        last.x - b.x,
        last.y - b.y,
        last.z - b.z,
      ].some((v) => Math.abs(v) > 1e-6) &&
        edge.kind !== 'parallel') ||
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
      e.kind === 'loop' || e.kind === 'parallel'
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
  for (const e of n.edges.filter((e) => e.kind === 'parallel')) {
    if (
      ![1, -1].includes(e.side!) ||
      JSON.stringify(e.points) !==
        JSON.stringify(parallelPoints(edgeAt(n, e.block), e.side!))
    )
      throw new Error('Invalid parallel running-line geometry.');
  }
  const crossovers = new Set<string>();
  for (const c of n.crossovers ?? []) {
    const main = edgeAt(n, c.main),
      parallel = edgeAt(n, c.parallel);
    if (
      !c.id ||
      crossovers.has(c.id) ||
      (n.crossovers ?? []).filter(
        (other) => other.main === c.main || other.parallel === c.parallel,
      ).length !== 1 ||
      !main ||
      parallel?.kind !== 'parallel' ||
      parallel.block !== main.id ||
      !Number.isFinite(c.position) ||
      c.position < 0.4 ||
      c.position > 0.6 ||
      !validCost(c.cost)
    )
      throw new Error('Invalid crossover connection.');
    crossovers.add(c.id);
  }
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
      !Number.isFinite(s.yardAngle) ||
      !Number.isFinite(s.yardLead) ||
      s.yardLead! < 17 ||
      s.yardLead! > 73 ||
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
  if (
    s.preferred &&
    (!Array.isArray(s.preferred) ||
      s.preferred.some(
        (id) => !edgeAt(network, id) || !s.legs.some((l) => l.edge === id),
      ))
  )
    throw new Error('Invalid preferred track constraint.');
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
  for (const section of sim.topology.sections.values())
    resources.add(`section:${section.id}`);
  for (const zone of sim.topology.zones) resources.add(zone.id);
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
        'depot',
        'capacity',
        'collision',
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
  }
}
