import { engineResearch, requireResearch } from './region';
import { planService, type Service } from './network';
import { locomotives } from './data';
import { journal, pay, WAGONS, type Wagon, type Cargo } from './economy';
import { newMotion } from './dispatch';
import { validateService, type Simulation } from './simulation';

export const ENGINES = locomotives.map((l, i) => ({
  ...l,
  role: [
    'Mountain freight',
    'Express passenger',
    'Branch passenger',
    'Mixed traffic',
    'Mixed traffic',
    'Light express',
    'Branch freight',
    'Express passenger',
    'Heavy freight',
    'Heavy freight',
    'Mountain mixed',
    'Fast heavy mixed',
  ][i],
  traction: [102, 78, 70, 88, 90, 72, 92, 82, 116, 130, 122, 112][i],
  mass: [80, 86, 60, 68, 74, 65, 70, 82, 92, 105, 96, 102][i],
  fuelRate: [
    0.29, 0.38, 0.2, 0.25, 0.27, 0.28, 0.24, 0.32, 0.37, 0.43, 0.35, 0.4,
  ][i],
  reliability: [
    0.91, 0.88, 0.86, 0.9, 0.93, 0.89, 0.94, 0.92, 0.95, 0.9, 0.97, 0.96,
  ][i],
  price: [
    42000, 88000, 28000, 36000, 44000, 60000, 39000, 74000, 69000, 82000, 96000,
    108000,
  ][i],
  maintenance: [5, 9, 3, 4, 5, 5, 4, 7, 8, 10, 8, 10][i],
}));
export const UPGRADES = {
  none: {
    label: 'Standard',
    price: 0,
    traction: 1,
    speed: 1,
    fuel: 1,
    wear: 1,
    capacity: 1,
  },
  economy: {
    label: 'Economy tuning · −20% fuel, −10% traction',
    price: 6500,
    traction: 0.9,
    speed: 1,
    fuel: 0.8,
    wear: 1,
    capacity: 1,
  },
  reliability: {
    label: 'Reinforced gear · −35% wear, −5% speed',
    price: 9000,
    traction: 1,
    speed: 0.95,
    fuel: 1,
    wear: 0.65,
    capacity: 1,
  },
  capacity: {
    label: 'High capacity wagons · +20% load, +15% wagon mass',
    price: 11000,
    traction: 1,
    speed: 1,
    fuel: 1.08,
    wear: 1.1,
    capacity: 1.2,
  },
} as const;
export type FleetUnit = {
  engine: number;
  owned: boolean;
  condition: number;
  fuel: number;
  water: number;
  autoService: boolean;
  serviceAt: number;
  upgrade: keyof typeof UPGRADES;
  consist: Wagon[];
  job: null | { kind: 'service' | 'supplies'; remaining: number; node: number };
  detour?: {
    service: Service;
    leg: number;
    origin: number;
    depot: number;
    serviced: boolean;
  };
  serviceRequested: boolean;
  serviced: number;
  downtime: number;
  distance: number;
};
export type FleetState = { units: FleetUnit[]; depots: number[] };
export function createFleet(sim: Simulation): FleetState {
  return {
    depots: [
      0,
      4,
      7,
      ...sim.network.stations
        .filter((s) => s.node >= 8 && !s.built)
        .map((s) => s.node),
    ],
    units: sim.trains.map((t) => ({
      engine: t.id,
      owned: true,
      condition: 100,
      fuel: 100,
      water: 100,
      autoService: true,
      serviceAt: 65,
      upgrade: 'none',
      consist: Array.from(
        { length: t.cars },
        () => sim.economy.services[t.id].wagon,
      ),
      job: null,
      serviceRequested: false,
      serviced: 0,
      downtime: 0,
      distance: t.motion.travelled,
    })),
  };
}
export function fleetFactors(sim: Simulation, id: number) {
  const u = sim.fleet.units[id],
    spec = ENGINES[u.engine],
    upgrade = UPGRADES[u.upgrade];
  const health = Math.max(0.4, Math.min(1, u.condition / 40));
  const supplies = u.fuel < 5 || u.water < 5 ? 0.55 : 1;
  return { spec, upgrade, factor: health * supplies };
}
export function wagonCapacity(sim: Simulation, id: number, cargo?: Cargo) {
  const u = sim.fleet?.units[id];
  const wagons =
    u?.consist.length === sim.trains[id].cars
      ? u.consist
      : Array.from(
          { length: sim.trains[id].cars },
          () => sim.economy.services[id].wagon,
        );
  return Math.floor(
    wagons.filter(
      (w) => !cargo || (WAGONS[w].cargo as readonly Cargo[]).includes(cargo),
    ).length *
      18 *
      (u ? UPGRADES[u.upgrade].capacity : 1),
  );
}
export function resale(sim: Simulation, id: number) {
  const u = sim.fleet.units[id];
  return u.owned
    ? Math.floor(ENGINES[u.engine].price * 0.55 * (0.5 + u.condition / 200))
    : 0;
}
function stationary(sim: Simulation, id: number, empty = false) {
  const t = sim.trains[id],
    u = sim.fleet.units[id];
  if (
    !t ||
    !u ||
    t.motion.started ||
    t.motion.velocity > 0 ||
    u.job ||
    u.detour
  )
    throw new Error('Stop at a station and finish servicing first.');
  if (empty && sim.economy.services[id].manifest)
    throw new Error(
      'Deliver the cargo before changing the consist or selling.',
    );
  return { t, u, node: sim.endpoints(t)[0] };
}
export function replaceEngine(sim: Simulation, id: number, engine: number) {
  const { u, t } = stationary(sim, id);
  if (!Number.isInteger(engine) || !ENGINES[engine])
    throw new Error('Choose a locomotive.');
  const research = engineResearch(engine);
  if (research) requireResearch(sim, research);
  const price = ENGINES[engine].price,
    credit = resale(sim, id);
  if (!sim.canAfford(Math.max(0, price - credit)))
    throw new Error(`Replacement needs $${price - credit}.`);
  // Both entries are committed only after every check; net financing needs no temporary loan.
  if (credit)
    journal(sim, 'refund', credit, 'Locomotive trade-in', { train: id });
  pay(sim, price, 'wagon', 'Locomotive purchase', id);
  Object.assign(u, {
    engine,
    owned: true,
    condition: 100,
    fuel: 100,
    water: 100,
    job: null,
    serviceRequested: false,
    upgrade: u.upgrade === 'capacity' ? 'capacity' : 'none',
  });
  t.held = true;
  sim.revision++;
}
export function sellEngine(sim: Simulation, id: number) {
  const { u, t } = stationary(sim, id, true);
  if (!u.owned) throw new Error('This service has no locomotive.');
  journal(
    sim,
    'refund',
    resale(sim, id),
    'Locomotive sold; service and wagons retained',
    { train: id },
  );
  u.owned = false;
  t.held = true;
  // Withdraw only an empty stationary consist; preserve cumulative accounts and service order.
  const motion = newMotion();
  motion.travelled = t.motion.travelled;
  motion.calls = t.motion.calls;
  motion.departures = t.motion.departures;
  motion.onTime = t.motion.onTime;
  t.motion = motion;
  t.distance = 0;
  sim.dispatch.reservations = sim.dispatch.reservations.filter(
    (r) => r.owner !== id,
  );
  sim.traffic.refreshProtection();
  sim.revision++;
}
export function editConsist(sim: Simulation, id: number, consist: Wagon[]) {
  const { t, u } = stationary(sim, id, true);
  if (
    consist.length < 3 ||
    consist.length > 6 ||
    consist.some((w) => !Object.hasOwn(WAGONS, w))
  )
    throw new Error('Choose three to six compatible wagons.');
  // Adding length still uses the physical rear-clearance validator, before any debit.
  if (consist.length > t.cars)
    throw new Error(
      'Use Add wagon first so the dispatcher can protect the longer train.',
    );
  const price = consist.reduce(
    (cost, w, i) => cost + (u.consist[i] === w ? 0 : 850),
    0,
  );
  if (!sim.canAfford(price)) throw new Error(`Consist refit costs $${price}.`);
  pay(sim, price, 'wagon', 'Ordered consist refit', id);
  t.cars = consist.length;
  u.consist = [...consist];
  sim.economy.services[id].wagon = consist[0];
  sim.traffic.refreshProtection();
  sim.revision++;
}
export function upgradeEngine(
  sim: Simulation,
  id: number,
  upgrade: keyof typeof UPGRADES,
) {
  const { u } = stationary(sim, id, true);
  if (!u.owned || !Object.hasOwn(UPGRADES, upgrade))
    throw new Error('Choose an owned engine and upgrade.');
  if (u.upgrade === upgrade) return;
  if (!sim.canAfford(UPGRADES[upgrade].price))
    throw new Error('Insufficient funds for this upgrade.');
  pay(sim, UPGRADES[upgrade].price, 'wagon', 'Fleet upgrade: ' + upgrade, id);
  u.upgrade = upgrade;
  sim.revision++;
}
export function buildDepot(sim: Simulation, node: number) {
  requireResearch(sim, 'civil');
  if (!sim.network.stations.some((s) => s.node === node))
    throw new Error('Choose a station.');
  if (sim.fleet.depots.includes(node))
    throw new Error('This station already has a workshop.');
  if (!sim.canAfford(18000)) throw new Error('A workshop costs $18,000.');
  pay(sim, 18000, 'construction', 'Station workshop');
  sim.fleet.depots.push(node);
  sim.revision++;
}
export function tickFleet(sim: Simulation) {
  for (const t of sim.trains) {
    const u = sim.fleet.units[t.id],
      { spec, upgrade } = fleetFactors(sim, t.id);
    if (!u.owned) continue;
    const distance = Math.max(0, t.motion.travelled - u.distance);
    u.distance = t.motion.travelled;
    u.fuel = Math.max(
      0,
      u.fuel - distance * spec.fuelRate * upgrade.fuel * 0.08,
    );
    u.water = Math.max(0, u.water - distance * 0.032);
    u.condition = Math.max(
      0,
      u.condition -
        distance *
          (0.007 + (1 - spec.reliability) * 0.04) *
          upgrade.wear *
          (1 + (t.cars - 3) * 0.12),
    );
    if (u.job) {
      u.job.remaining = Math.max(0, u.job.remaining - 0.05);
      u.downtime += 0.05;
      if (u.job.remaining <= 1e-8) {
        if (u.job.kind === 'service') {
          u.condition = 100;
          u.serviced++;
          u.serviceRequested = false;
          if (u.detour) u.detour.serviced = true;
        }
        u.fuel = 100;
        u.water = 100;
        u.job = null;
      }
      continue;
    }
    if (t.motion.started || t.motion.velocity > 0) continue;
    const node = sim.endpoints(t)[0];
    if (u.detour?.serviced && node === u.detour.origin) {
      sim.services[t.id] = u.detour.service;
      t.leg = u.detour.leg;
      t.motion.physical.retryAt = 0;
      delete u.detour;
    }
    // Empty trains without a workshop on their service make a protected out-and-back visit.
    // Existing manifests finish their delivery before diversion; no cargo is loaded on the visit.
    if (
      !u.detour &&
      !sim.economy.services[t.id].manifest &&
      !sim.fleet.depots.includes(node) &&
      (u.serviceRequested || (u.autoService && u.condition <= u.serviceAt)) &&
      !sim.services[t.id].stops.some((stop) => sim.fleet.depots.includes(stop))
    ) {
      const routes = sim.fleet.depots
        .flatMap((depot) => {
          try {
            const service = planService(
              sim.network,
              t.id,
              'Workshop transfer',
              [node, depot],
              3.5,
            );
            return [
              {
                depot,
                service,
                length: service.legs.reduce(
                  (n, l) =>
                    n + sim.network.edges.find((e) => e.id === l.edge)!.length,
                  0,
                ),
              },
            ];
          } catch {
            return [];
          }
        })
        .sort((a, b) => a.length - b.length || a.depot - b.depot);
      if (routes.length) {
        const route = routes[0];
        u.detour = {
          service: structuredClone(sim.services[t.id]),
          leg: t.leg,
          origin: node,
          depot: route.depot,
          serviced: false,
        };
        u.serviceRequested = true;
        sim.services[t.id] = route.service;
        t.leg = 0;
        t.motion.physical.retryAt = 0;
      }
    }
    const workshop = sim.fleet.depots.includes(node);
    const service =
      workshop &&
      (u.serviceRequested || (u.autoService && u.condition <= u.serviceAt));
    const supplies = u.fuel < 25 || u.water < 25;
    if (service || supplies) {
      const cost = Math.ceil(
        (100 - u.water) * 0.3 +
          (service ? 150 + (100 - u.condition) * spec.maintenance : 0),
      );
      journal(
        sim,
        'maintenance',
        -cost,
        service
          ? 'Workshop service and supplies'
          : 'Station coal and water stop',
        { train: t.id },
      );
      u.job = {
        kind: service ? 'service' : 'supplies',
        node,
        remaining: service ? 12 + (100 - u.condition) * 0.45 : 6,
      };
    }
  }
}
export function validateFleet(sim: Simulation) {
  const f = sim.fleet;
  const fail = () => {
    throw new Error('Invalid fleet or depot state.');
  };
  if (
    !f ||
    !Array.isArray(f.units) ||
    f.units.length !== sim.trains.length ||
    !Array.isArray(f.depots) ||
    new Set(f.depots).size !== f.depots.length ||
    f.depots.some((n) => !sim.network.stations.some((s) => s.node === n))
  )
    fail();
  f.units.forEach((u, i) => {
    const t = sim.trains[i];
    if (
      !u ||
      u.job === undefined ||
      !Number.isInteger(u.serviced) ||
      !Number.isInteger(u.engine) ||
      !ENGINES[u.engine] ||
      typeof u.owned !== 'boolean' ||
      typeof u.autoService !== 'boolean' ||
      typeof u.serviceRequested !== 'boolean' ||
      !Object.hasOwn(UPGRADES, u.upgrade) ||
      ![u.condition, u.fuel, u.water].every(
        (n) => Number.isFinite(n) && n >= 0 && n <= 100,
      ) ||
      !Number.isFinite(u.serviceAt) ||
      u.serviceAt < 30 ||
      u.serviceAt > 90 ||
      ![u.serviced, u.downtime, u.distance].every(
        (n) => Number.isFinite(n) && n >= 0,
      ) ||
      u.distance > t.motion.travelled + 1e-6 ||
      !Array.isArray(u.consist) ||
      u.consist.length !== t.cars ||
      u.consist.some((w) => !Object.hasOwn(WAGONS, w)) ||
      u.consist[0] !== sim.economy.services[i].wagon
    )
      fail();
    if (
      !u.owned &&
      (!t.held ||
        !t.motion.physical.queued ||
        sim.economy.services[i].manifest ||
        u.job)
    )
      fail();
    if (u.detour) {
      const d = u.detour;
      if (
        !d.service ||
        !Array.isArray(d.service.stops) ||
        !Array.isArray(d.service.legs) ||
        d.service.trainId !== i ||
        !Number.isInteger(d.leg) ||
        !d.service.legs[d.leg] ||
        d.service.legs[d.leg].from !== d.origin ||
        !f.depots.includes(d.depot) ||
        typeof d.serviced !== 'boolean' ||
        !u.owned ||
        sim.economy.services[i].manifest
      )
        fail();
      try {
        validateService(sim.network, d.service, i);
      } catch {
        fail();
      }
    }
    if (
      u.job &&
      (!['service', 'supplies'].includes(u.job.kind) ||
        !Number.isFinite(u.job.remaining) ||
        u.job.remaining <= 0 ||
        u.job.remaining > 60 ||
        t.motion.started ||
        t.motion.velocity > 0 ||
        u.job.node !== sim.endpoints(t)[0] ||
        (u.job.kind === 'service' && !f.depots.includes(u.job.node)))
    )
      fail();
  });
}
