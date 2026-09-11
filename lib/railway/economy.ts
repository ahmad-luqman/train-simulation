import { townRate } from './region';
import { fleetFactors, wagonCapacity } from './fleet';
import type { Simulation, TrainState } from './simulation';

export const CARGO = [
  'passengers',
  'timber',
  'grain',
  'coal',
  'lumber',
  'flour',
  'goods',
] as const;
export type Cargo = (typeof CARGO)[number];
export const WAGONS = {
  coaches: { label: 'Passenger coaches', cargo: ['passengers'] },
  flat: { label: 'Flat wagons', cargo: ['timber', 'lumber'] },
  hopper: { label: 'Hopper wagons', cargo: ['coal', 'grain'] },
  box: { label: 'Box wagons', cargo: ['flour', 'goods'] },
} satisfies Record<string, { label: string; cargo: Cargo[] }>;
export type Wagon = keyof typeof WAGONS;
export const TARIFF: Record<Cargo, number> = {
  passengers: 45,
  timber: 70,
  grain: 60,
  coal: 65,
  lumber: 105,
  flour: 100,
  goods: 120,
};
export const STORAGE = 180;
export const LOAN_LIMIT = 100000;
export const LOAN_STEP = 25000;
export const INTEREST = 0.002; // Per simulation minute, on outstanding principal.
export type Stock = Record<Cargo, number>;
export const emptyStock = (): Stock =>
  Object.fromEntries(CARGO.map((c) => [c, 0])) as Stock;
export type TownEconomy = { node: number; stock: Stock; received: Stock };
export const RECIPES: {
  node: number;
  input: Cargo;
  output: Cargo;
  label: string;
}[] = [
  { node: 7, input: 'timber', output: 'lumber', label: 'Riverside sawmill' },
  { node: 4, input: 'grain', output: 'flour', label: 'Grand Junction mill' },
  { node: 4, input: 'coal', output: 'goods', label: 'Grand Junction industry' },
];
export const PRODUCERS: { node: number; cargo: Cargo }[] = [
  { node: 2, cargo: 'timber' },
  { node: 3, cargo: 'grain' },
  { node: 6, cargo: 'grain' },
  { node: 0, cargo: 'coal' },
  { node: 8, cargo: 'timber' },
  { node: 9, cargo: 'coal' },
  { node: 12, cargo: 'timber' },
];
export type Manifest = {
  cargo: Cargo;
  quantity: number;
  source: number;
  destination: number;
  loadedAt: number;
};
export type CargoService = {
  wagon: Wagon;
  manifest: Manifest | null;
  warning: string;
  emptyRuns: number;
};
export const CATEGORIES = [
  'opening',
  'delivery',
  'fuel',
  'crew',
  'maintenance',
  'infrastructure',
  'interest',
  'contract',
  'penalty',
  'construction',
  'wagon',
  'refund',
  'loan',
  'repayment',
  'sandbox',
] as const;
export type Category = (typeof CATEGORIES)[number];
export type LedgerEntry = {
  id: number;
  at: number;
  category: Category;
  amount: number;
  balance: number;
  debt: number;
  note: string;
  train?: number;
  cargo?: Cargo;
  quantity?: number;
  rejected?: number;
  builtTrack?: boolean;
  source?: number;
  destination?: number;
  contract?: number;
};
export type Contract = {
  id: number;
  cargo: Cargo;
  destination: number;
  required: number;
  delivered: number;
  deadline: number;
  acceptedAt: number;
  afterEntry: number;
  reward: number;
  penalty: number;
  status: 'active' | 'completed' | 'failed';
};
export const OFFERS: {
  cargo: Cargo;
  destination: number;
  required: number;
  duration: number;
  reward: number;
  penalty: number;
  label: string;
}[] = [
  {
    cargo: 'timber',
    destination: 7,
    required: 36,
    duration: 1800,
    reward: 8000,
    penalty: 1000,
    label: 'Supply the sawmill',
  },
  {
    cargo: 'grain',
    destination: 4,
    required: 36,
    duration: 1800,
    reward: 8000,
    penalty: 1000,
    label: 'Stock the flour mill',
  },
  {
    cargo: 'coal',
    destination: 4,
    required: 36,
    duration: 1800,
    reward: 8000,
    penalty: 1000,
    label: 'Fuel local industry',
  },
  {
    cargo: 'lumber',
    destination: 4,
    required: 24,
    duration: 2400,
    reward: 10000,
    penalty: 1500,
    label: 'Build Grand Junction homes',
  },
  {
    cargo: 'flour',
    destination: 5,
    required: 24,
    duration: 2400,
    reward: 10000,
    penalty: 1500,
    label: 'Fill Kingscross bakeries',
  },
  {
    cargo: 'goods',
    destination: 1,
    required: 24,
    duration: 2400,
    reward: 10000,
    penalty: 1500,
    label: 'Supply Ashford shops',
  },
];
export type EconomyState = {
  mode: 'standard' | 'unlimited';
  towns: TownEconomy[];
  services: CargoService[];
  created: Stock;
  used: Stock;
  consumed: Stock;
  debt: number;
  second: number;
  billedMinute: number;
  billedDistance: number[];
  ledger: LedgerEntry[];
  contracts: Contract[];
  openingRevenue: number[];
  openingDelivered: number[];
};
export function createEconomy(nodes: number[], count: number): EconomyState {
  const e: EconomyState = {
    mode: 'standard',
    towns: nodes.map((node) => ({
      node,
      stock: emptyStock(),
      received: emptyStock(),
    })),
    services: Array.from({ length: count }, () => ({
      wagon: 'coaches',
      manifest: null,
      warning: '',
      emptyRuns: 0,
    })),
    created: emptyStock(),
    used: emptyStock(),
    consumed: emptyStock(),
    debt: 0,
    second: 0,
    billedMinute: 0,
    billedDistance: Array(count).fill(0),
    ledger: [],
    contracts: [],
    openingRevenue: Array(count).fill(0),
    openingDelivered: Array(count).fill(0),
  };
  // Freight defaults follow the existing services through each raw-material chain.
  e.services[3].wagon = 'hopper';
  e.services[4].wagon = 'hopper';
  e.services[6].wagon = 'flat';
  e.services[9].wagon = 'box';
  for (const town of e.towns) {
    town.stock.passengers = 90;
    e.created.passengers += 90;
  }
  for (const p of PRODUCERS) {
    const town = e.towns.find((t) => t.node === p.node);
    if (town) {
      town.stock[p.cargo] = 120;
      e.created[p.cargo] += 120;
    }
  }
  return e;
}
export function accepts(node: number, cargo: Cargo) {
  if (cargo === 'passengers') return true;
  if (['lumber', 'flour', 'goods'].includes(cargo))
    return !RECIPES.some((r) => r.node === node && r.output === cargo);
  return RECIPES.some((r) => r.node === node && r.input === cargo);
}
export function supply(town: TownEconomy, cargo: Cargo) {
  return cargo === 'passengers' ||
    PRODUCERS.some((p) => p.node === town.node && p.cargo === cargo) ||
    RECIPES.some((r) => r.node === town.node && r.output === cargo)
    ? town.stock[cargo]
    : 0;
}
export function demand(town: TownEconomy, cargo: Cargo) {
  if (!accepts(town.node, cargo)) return 0;
  return (
    STORAGE -
    (cargo === 'passengers' ? town.received[cargo] : town.stock[cargo])
  );
}
export function journal(
  sim: Simulation,
  category: Category,
  amount: number,
  note: string,
  extra: Partial<
    Pick<
      LedgerEntry,
      | 'train'
      | 'cargo'
      | 'quantity'
      | 'rejected'
      | 'builtTrack'
      | 'source'
      | 'destination'
      | 'contract'
    >
  > = {},
) {
  if (!Number.isSafeInteger(amount))
    throw new Error('Invalid monetary amount.');
  sim.treasury += amount;
  sim.economy.ledger.push({
    id: sim.economy.ledger.length + 1,
    at: sim.elapsed,
    category,
    amount,
    balance: sim.treasury,
    debt: sim.economy.debt,
    note,
    ...extra,
  });
}
export function pay(
  sim: Simulation,
  amount: number,
  category: 'construction' | 'wagon' | 'maintenance',
  note: string,
  train?: number,
) {
  if (sim.economy.mode === 'unlimited' && sim.treasury < amount)
    journal(sim, 'sandbox', amount - sim.treasury, 'Unlimited funds grant');
  journal(sim, category, -amount, note, train === undefined ? {} : { train });
}
export function accounts(e: EconomyState, train?: number) {
  const entries = e.ledger.filter(
    (l) => train === undefined || l.train === train,
  );
  const revenue = entries
    .filter((l) => l.category === 'delivery' || l.category === 'contract')
    .reduce((n, l) => n + l.amount, 0);
  const expenses = -entries
    .filter((l) =>
      [
        'fuel',
        'crew',
        'maintenance',
        'infrastructure',
        'interest',
        'penalty',
      ].includes(l.category),
    )
    .reduce((n, l) => n + l.amount, 0);
  return { revenue, expenses, profit: revenue - expenses };
}
export function tickEconomy(sim: Simulation) {
  const e = sim.economy;
  // One integer clock, independent of rendering and simulation speed.
  const second = Math.floor(sim.elapsed + 1e-7);
  while (e.second < second) {
    e.second++;
    for (const station of sim.network.stations)
      if (!e.towns.some((t) => t.node === station.node))
        e.towns.push({
          node: station.node,
          stock: emptyStock(),
          received: emptyStock(),
        });
    if (e.second % 5 === 0) {
      for (const town of e.towns) {
        const rate = townRate(sim, town.node);
        const amount = Math.min(rate, STORAGE - town.stock.passengers);
        town.stock.passengers += amount;
        e.created.passengers += amount;
        for (const cargo of CARGO) {
          const consumed = Math.min(
            rate,
            cargo === 'passengers'
              ? town.received[cargo]
              : accepts(town.node, cargo) &&
                  ['lumber', 'flour', 'goods'].includes(cargo)
                ? town.stock[cargo]
                : 0,
          );
          if (cargo === 'passengers') town.received[cargo] -= consumed;
          else town.stock[cargo] -= consumed;
          e.consumed[cargo] += consumed;
        }
      }
      for (const p of PRODUCERS) {
        const town = e.towns.find((t) => t.node === p.node)!;
        const amount = Math.min(2, STORAGE - town.stock[p.cargo]);
        town.stock[p.cargo] += amount;
        e.created[p.cargo] += amount;
      }
      for (const r of RECIPES) {
        const town = e.towns.find((t) => t.node === r.node)!;
        const amount = Math.min(
          2,
          town.stock[r.input],
          STORAGE - town.stock[r.output],
        );
        town.stock[r.input] -= amount;
        town.stock[r.output] += amount;
        e.used[r.input] += amount;
        e.created[r.output] += amount;
      }
    }
  }
  for (const c of e.contracts)
    if (c.status === 'active' && sim.elapsed > c.deadline + 1e-8) {
      c.status = 'failed';
      journal(
        sim,
        'penalty',
        -c.penalty,
        `Contract #${c.id} missed: ${c.cargo}`,
        { contract: c.id },
      );
    }
  const minute = Math.floor((sim.elapsed + 1e-7) / 60);
  if (minute > e.billedMinute) {
    const periods = minute - e.billedMinute;
    for (const t of sim.trains) {
      if (!sim.fleet.units[t.id].owned) continue;
      const { spec, upgrade } = fleetFactors(sim, t.id);
      const distance = Math.max(0, t.motion.travelled - e.billedDistance[t.id]);
      journal(
        sim,
        'fuel',
        -Math.ceil(distance * spec.fuelRate * upgrade.fuel),
        'Locomotive fuel consumption',
        { train: t.id },
      );
      journal(sim, 'crew', -6 * periods, 'Crew · $6 per minute', {
        train: t.id,
      });
      journal(
        sim,
        'maintenance',
        -(spec.maintenance + t.cars) * periods,
        'Locomotive and wagon upkeep',
        { train: t.id },
      );
      e.billedDistance[t.id] = t.motion.travelled;
    }
    journal(
      sim,
      'infrastructure',
      -Math.ceil(
        sim.network.edges.reduce((n, edge) => n + edge.length * 0.02, 0) +
          sim.network.stations.reduce((n, s) => n + s.platforms.length, 0),
      ) * periods,
      'Track and platform upkeep',
    );
    if (e.debt)
      journal(
        sim,
        'interest',
        -Math.ceil(e.debt * INTEREST) * periods,
        'Loan interest · 0.2% per minute',
      );
    e.billedMinute = minute;
  }
}
export function loadCargo(
  sim: Simulation,
  t: TrainState,
  from: number,
  to: number,
) {
  const service = sim.economy.services[t.id];
  if (service.manifest) return;
  const source = sim.economy.towns.find((n) => n.node === from),
    destination = sim.economy.towns.find((n) => n.node === to);
  if (!source || !destination) {
    service.warning = 'This station has no inventory yet.';
    return;
  }
  const compatible: readonly Cargo[] = [
    ...new Set(sim.fleet.units[t.id].consist.flatMap((w) => WAGONS[w].cargo)),
  ];
  const cargo = [...compatible]
    .filter((c) => supply(source, c) > 0 && demand(destination, c) > 0)
    .sort((a, b) => {
      const contracted = (c: Cargo) =>
        Number(
          sim.economy.contracts.some(
            (contract) =>
              contract.status === 'active' &&
              contract.cargo === c &&
              contract.destination === to,
          ),
        );
      return (
        contracted(b) - contracted(a) || supply(source, b) - supply(source, a)
      );
    })[0];
  const limit = Math.min(
    wagonCapacity(sim, t.id, cargo),
    Math.floor(sim.services[t.id].dwell * 12),
  );
  const quantity = cargo
    ? Math.min(limit, source.stock[cargo], demand(destination, cargo))
    : 0;
  if (!cargo || !quantity) {
    service.emptyRuns++;
    service.warning = !limit
      ? 'Empty departure: increase loading dwell above zero.'
      : 'Empty departure: no compatible stock or destination demand.';
    t.load = 0;
    return;
  }
  source.stock[cargo] -= quantity;
  service.manifest = {
    cargo,
    quantity,
    source: from,
    destination: to,
    loadedAt: sim.elapsed,
  };
  service.warning =
    quantity < limit
      ? 'Partial load: source stock or destination demand is limited.'
      : '';
  t.load = Math.round((quantity / wagonCapacity(sim, t.id)) * 100);
}
export function unloadCargo(sim: Simulation, t: TrainState, node: number) {
  const service = sim.economy.services[t.id],
    m = service.manifest;
  if (!m || m.destination !== node) return;
  const destination = sim.economy.towns.find((town) => town.node === node)!;
  const accepted = Math.min(m.quantity, demand(destination, m.cargo));
  const rejected = m.quantity - accepted;
  if (m.cargo === 'passengers') destination.received.passengers += accepted;
  else destination.stock[m.cargo] += accepted;
  const income = accepted * TARIFF[m.cargo];
  journal(
    sim,
    'delivery',
    income,
    `${accepted} ${m.cargo} accepted at ${sim.network.nodes.find((n) => n.id === node)!.name}`,
    {
      train: t.id,
      cargo: m.cargo,
      quantity: accepted,
      rejected,
      builtTrack: t.motion.history.some((leg) =>
        sim.network.edges.some((e) => e.id === leg.edge && e.built),
      ),
      source: m.source,
      destination: node,
    },
  );
  t.delivered += accepted;
  sim.delivered += accepted;
  t.revenue += income;
  for (const c of sim.economy.contracts)
    if (
      c.status === 'active' &&
      c.cargo === m.cargo &&
      c.destination === node &&
      sim.elapsed <= c.deadline + 1e-8
    ) {
      c.delivered += Math.min(accepted, c.required - c.delivered);
      if (c.delivered === c.required) {
        c.status = 'completed';
        journal(sim, 'contract', c.reward, `Contract #${c.id} completed`, {
          train: t.id,
          contract: c.id,
        });
      }
    }
  service.warning = rejected
    ? `${rejected} ${m.cargo} rejected: destination storage is full; cargo stays aboard.`
    : '';
  m.quantity = rejected;
  if (!rejected) service.manifest = null;
  t.load = Math.round((rejected / wagonCapacity(sim, t.id)) * 100);
  sim.events.unshift(
    `${accepted} ${m.cargo} delivered · +$${income}${rejected ? ` · ${rejected} retained aboard` : ''}`,
  );
  sim.events = sim.events.slice(0, 20);
}
export function acceptContract(sim: Simulation, offer: number) {
  const o = OFFERS[offer];
  if (!o) throw new Error('Choose a local contract.');
  if (
    sim.economy.contracts.some(
      (c) =>
        c.status === 'active' &&
        c.cargo === o.cargo &&
        c.destination === o.destination,
    )
  )
    throw new Error('This contract is already active.');
  sim.economy.contracts.push({
    id: sim.economy.contracts.length + 1,
    cargo: o.cargo,
    destination: o.destination,
    required: o.required,
    delivered: 0,
    deadline: sim.elapsed + o.duration,
    acceptedAt: sim.elapsed,
    afterEntry: sim.economy.ledger.length,
    reward: o.reward,
    penalty: o.penalty,
    status: 'active',
  });
}
export function setMoneyMode(sim: Simulation, mode: EconomyState['mode']) {
  if (!['standard', 'unlimited'].includes(mode))
    throw new Error('Choose a money mode.');
  if (sim.region.mode !== 'sandbox' && mode === 'unlimited')
    throw new Error(
      'Unlimited funds are available in sandbox. Loans remain available here.',
    );
  sim.economy.mode = mode;
}
export function borrow(sim: Simulation) {
  if (sim.economy.debt + LOAN_STEP > LOAN_LIMIT)
    throw new Error('The $100,000 credit limit has been reached.');
  sim.economy.debt += LOAN_STEP;
  journal(
    sim,
    'loan',
    LOAN_STEP,
    'Loan advance · 0.2% interest per simulation minute',
  );
}
export function repay(sim: Simulation) {
  const amount = Math.min(LOAN_STEP, sim.economy.debt);
  if (!amount) throw new Error('There is no loan to repay.');
  if (sim.treasury < amount)
    throw new Error('Not enough cash for this repayment.');
  sim.economy.debt -= amount;
  journal(sim, 'repayment', -amount, 'Loan principal repayment');
}
export function refit(sim: Simulation, id: number, wagon: Wagon) {
  const t = sim.trains[id],
    service = sim.economy.services[id];
  if (!t || !Object.hasOwn(WAGONS, wagon))
    throw new Error('Choose a train and wagon family.');
  if (
    t.motion.started ||
    t.motion.velocity > 0 ||
    service.manifest ||
    sim.fleet.units[id].job ||
    sim.fleet.units[id].detour
  )
    throw new Error(
      'Refit requires an empty train stopped at a station or depot. Deliver its cargo first.',
    );
  if (service.wagon === wagon) return;
  if (!sim.canAfford(2500)) throw new Error('Refitting costs $2,500.');
  pay(sim, 2500, 'wagon', 'Wagon family refit', id);
  service.wagon = wagon;
  sim.fleet.units[id].consist = Array.from({ length: t.cars }, () => wagon);
  service.warning = '';
  sim.revision++;
}

/** Restore validates a detached simulation before replacing live state. */
export function validateEconomy(sim: Simulation) {
  const e = sim.economy;
  const fail = () => {
    throw new Error(
      'Invalid economy save: inventory, accounts or cargo do not reconcile.',
    );
  };
  const natural = (n: number) => Number.isSafeInteger(n) && n >= 0;
  const stock = (s: Stock, capped = false) =>
    s && CARGO.every((c) => natural(s[c]) && (!capped || s[c] <= STORAGE));
  if (
    !e ||
    !['standard', 'unlimited'].includes(e.mode) ||
    !natural(e.debt) ||
    e.debt > LOAN_LIMIT ||
    !natural(e.second) ||
    e.second !== Math.floor(sim.elapsed + 1e-7) ||
    e.billedMinute !== Math.floor((sim.elapsed + 1e-7) / 60) ||
    !Array.isArray(e.towns) ||
    !Array.isArray(e.services) ||
    e.services.length !== sim.trains.length ||
    !Array.isArray(e.ledger) ||
    e.ledger.length < 1 ||
    e.ledger.length > 1000000 ||
    !Array.isArray(e.contracts) ||
    e.contracts.length > 10000 ||
    !stock(e.created) ||
    !stock(e.used) ||
    !stock(e.consumed) ||
    !Array.isArray(e.billedDistance) ||
    e.billedDistance.length !== sim.trains.length ||
    !e.billedDistance.every(
      (d, i) =>
        Number.isFinite(d) &&
        d >= 0 &&
        d <= sim.trains[i].motion.travelled + 1e-7,
    ) ||
    !Array.isArray(e.openingRevenue) ||
    e.openingRevenue.length !== sim.trains.length ||
    !e.openingRevenue.every(natural) ||
    !Array.isArray(e.openingDelivered) ||
    e.openingDelivered.length !== sim.trains.length ||
    !e.openingDelivered.every(natural)
  )
    fail();
  const total = emptyStock();
  const seen = new Set<number>();
  for (const town of e.towns) {
    if (
      !town ||
      seen.has(town.node) ||
      !sim.network.stations.some((s) => s.node === town.node) ||
      !stock(town.stock, true) ||
      !stock(town.received, true)
    )
      fail();
    seen.add(town.node);
    for (const c of CARGO) {
      if (c !== 'passengers' && town.received[c] !== 0) fail();
      total[c] += town.stock[c] + town.received[c];
    }
  }
  if ([0, 1, 2, 3, 4, 5, 6, 7].some((node) => !seen.has(node))) fail();
  for (const [id, service] of e.services.entries()) {
    if (
      !service ||
      !Object.hasOwn(WAGONS, service.wagon) ||
      typeof service.warning !== 'string' ||
      service.warning.length > 500 ||
      !natural(service.emptyRuns)
    )
      fail();
    const m = service.manifest;
    if (m !== null) {
      if (
        !m ||
        !CARGO.includes(m.cargo) ||
        wagonCapacity(sim, id, m.cargo) === 0 ||
        !natural(m.quantity) ||
        m.quantity < 1 ||
        m.quantity > wagonCapacity(sim, id, m.cargo) ||
        !seen.has(m.source) ||
        !seen.has(m.destination) ||
        m.source === m.destination ||
        !accepts(m.destination, m.cargo) ||
        !Number.isFinite(m.loadedAt) ||
        m.loadedAt < 0 ||
        m.loadedAt > sim.elapsed
      )
        fail();
      total[m.cargo] += m.quantity;
    }
    if (
      sim.trains[id].load !==
      Math.round(((m?.quantity ?? 0) / wagonCapacity(sim, id)) * 100)
    )
      fail();
  }
  for (const c of CARGO)
    if (e.created[c] - e.used[c] - e.consumed[c] !== total[c]) fail();
  for (const r of RECIPES) if (e.created[r.output] !== e.used[r.input]) fail();
  if (e.used.passengers || e.used.lumber || e.used.flour || e.used.goods)
    fail();
  let cash = 0,
    debt = 0,
    at = 0;
  const revenues = [...e.openingRevenue],
    deliveries = [...e.openingDelivered];
  for (const [i, l] of e.ledger.entries()) {
    if (
      !l ||
      l.id !== i + 1 ||
      !CATEGORIES.includes(l.category) ||
      !Number.isSafeInteger(l.amount) ||
      !Number.isFinite(l.at) ||
      l.at < at ||
      l.at > sim.elapsed ||
      typeof l.note !== 'string' ||
      l.note.length > 500 ||
      (l.builtTrack !== undefined && typeof l.builtTrack !== 'boolean') ||
      (l.train !== undefined && (!natural(l.train) || !sim.trains[l.train]))
    )
      fail();
    if ((i === 0) !== (l.category === 'opening')) fail();
    if (
      ['delivery', 'contract', 'refund', 'loan', 'sandbox'].includes(
        l.category,
      ) &&
      l.amount < 0
    )
      fail();
    if (
      [
        'fuel',
        'crew',
        'maintenance',
        'infrastructure',
        'interest',
        'penalty',
        'construction',
        'wagon',
        'repayment',
      ].includes(l.category) &&
      l.amount > 0
    )
      fail();
    cash += l.amount;
    at = l.at;
    if (l.category === 'loan' || l.category === 'repayment') {
      if (Math.abs(l.amount) !== LOAN_STEP) fail();
      debt += l.amount;
    }
    if (l.balance !== cash || l.debt !== debt || debt < 0 || debt > LOAN_LIMIT)
      fail();
    if (l.category === 'delivery') {
      if (
        l.train === undefined ||
        !l.cargo ||
        !CARGO.includes(l.cargo) ||
        !natural(l.quantity!) ||
        !natural(l.rejected!) ||
        !seen.has(l.source!) ||
        !seen.has(l.destination!) ||
        l.source === l.destination ||
        !accepts(l.destination!, l.cargo) ||
        l.amount !== l.quantity! * TARIFF[l.cargo]
      )
        fail();
      revenues[l.train!] += l.amount;
      deliveries[l.train!] += l.quantity!;
    }
  }
  if (
    cash !== sim.treasury ||
    debt !== e.debt ||
    sim.delivered !== deliveries.reduce((n, d) => n + d, 0) ||
    sim.trains.some(
      (t) => t.revenue !== revenues[t.id] || t.delivered !== deliveries[t.id],
    )
  )
    fail();
  if (
    e.ledger.some(
      (l) =>
        ['contract', 'penalty'].includes(l.category) &&
        !e.contracts.some((c) => c.id === l.contract),
    )
  )
    fail();
  const active = new Set<string>();
  for (const [i, c] of e.contracts.entries()) {
    const offer = OFFERS.find(
      (o) => o.cargo === c?.cargo && o.destination === c?.destination,
    );
    if (
      !c ||
      c.id !== i + 1 ||
      !offer ||
      c.required !== offer.required ||
      c.reward !== offer.reward ||
      c.penalty !== offer.penalty ||
      !natural(c.delivered) ||
      c.delivered > c.required ||
      !Number.isFinite(c.deadline) ||
      !Number.isFinite(c.acceptedAt) ||
      c.acceptedAt < 0 ||
      c.acceptedAt > sim.elapsed ||
      c.deadline !== c.acceptedAt + offer.duration ||
      !natural(c.afterEntry) ||
      c.afterEntry < 1 ||
      c.afterEntry > e.ledger.length ||
      !['active', 'completed', 'failed'].includes(c.status) ||
      (c.status === 'completed') !== (c.delivered === c.required)
    )
      fail();
    const qualifying = e.ledger
      .slice(c.afterEntry)
      .filter(
        (l) =>
          l.category === 'delivery' &&
          l.cargo === c.cargo &&
          l.destination === c.destination &&
          l.at <= c.deadline + 1e-8,
      );
    if (
      c.delivered !==
      Math.min(
        c.required,
        qualifying.reduce((n, l) => n + l.quantity!, 0),
      )
    )
      fail();
    if (c.status === 'failed' && sim.elapsed <= c.deadline + 1e-8) fail();
    if (c.status === 'active') {
      const key = `${c.cargo}:${c.destination}`;
      if (active.has(key) || c.deadline < sim.elapsed - 1e-8) fail();
      active.add(key);
    }
    const settlements = e.ledger.filter((l) => l.contract === c.id);
    if (
      c.status === 'active'
        ? settlements.length !== 0
        : settlements.length !== 1 ||
          settlements[0].category !==
            (c.status === 'completed' ? 'contract' : 'penalty') ||
          settlements[0].amount !==
            (c.status === 'completed' ? c.reward : -c.penalty)
    )
      fail();
  }
}
