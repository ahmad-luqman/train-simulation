import type { Simulation } from './simulation';
import { accounts, pay } from './economy';
import { planService } from './network';

export const SCENARIOS = {
  mountain: {
    name: 'Mountain freight',
    duration: 3600,
    goal: 'Deliver 126 coal from Granite Ridge to Grand Junction.',
    hint: 'The heavy freight engine has the traction for the climb. Keep its workshop policy enabled.',
  },
  junction: {
    name: 'Junction relief',
    duration: 2400,
    goal: 'Deliver 210 units and resolve a real traffic wait after a dispatch intervention.',
    hint: 'Inspect the queue, prioritize a waiting train or change its schedule, then let it depart.',
  },
  river: {
    name: 'Across the river',
    duration: 3000,
    goal: 'Build a bridge-bearing line and deliver 84 units over player-built track.',
    hint: 'Pause before construction. Add a parallel line on Grand Junction–Riverside, set it to Both directions in Dispatcher, assign it in Build & route, then release the service.',
  },
  passenger: {
    name: 'On time express',
    duration: 2400,
    goal: 'Deliver 252 passengers with at least 12 departures and 70% punctuality.',
    hint: 'Set realistic departure intervals and give passenger trains priority at busy platforms.',
  },
} as const;
export type ScenarioId = keyof typeof SCENARIOS;
export type SessionMode = 'sandbox' | 'campaign' | ScenarioId;
export const TUTORIAL = [
  {
    id: 'select',
    title: 'Meet your railway',
    text: 'Select an owned locomotive in the roster or on the map.',
    panel: 'fleet',
  },
  {
    id: 'build',
    title: 'Construct a line',
    text: 'Pause, open Build & route, choose Second running line, Grand Junction–Riverside and Left of main track, then build. It gives your freight shuttle its own path.',
    panel: 'build',
  },
  {
    id: 'service',
    title: 'Configure a service',
    text: 'In Dispatcher set the new line to Both directions. In Build & route → Services, select Riverside provisions (Timberline), keep Grand Junction–Riverside as its stops, choose the new track and assign the service. The starters are already held for editing; release both when ready.',
    panel: 'build',
  },
  {
    id: 'delivery',
    title: 'Make the first delivery',
    text: 'Release the service and run the clock until cargo is accepted. Release both starters: grain feeds Grand Junction, then the box wagons carry flour to Riverside.',
    panel: 'economy',
  },
  {
    id: 'congestion',
    title: 'Clear a queue',
    text: 'In Dispatcher, prioritize a train waiting for traffic or revise its departure schedule. Progress counts when that train subsequently departs.',
    panel: 'dispatch',
  },
  {
    id: 'invest',
    title: 'Reinvest the earnings',
    text: 'After a delivery, research Civil engineering or purchase an engine, wagon upgrade or workshop.',
    panel: 'region',
  },
] as const;
export type TutorialAction = (typeof TUTORIAL)[number]['id'];
export const RESEARCH = {
  civil: {
    name: 'Civil engineering',
    price: 6000,
    description:
      '42 delivered units. Unlock controlled crossovers and workshop construction.',
    requires: [] as string[],
  },
  freight: {
    name: 'Industrial steam',
    price: 12000,
    description:
      'Civil engineering, 168 delivered units and one growing town. Unlock heavy and mountain locomotives.',
    requires: ['civil'],
  },
  express: {
    name: 'Express era',
    price: 16000,
    description:
      'Civil engineering, 12 departures and 70% punctuality. Unlock express locomotives.',
    requires: ['civil'],
  },
} as const;
export type ResearchId = keyof typeof RESEARCH;
export const ACHIEVEMENTS = [
  'first-delivery',
  'town-builder',
  'reliable-railway',
  'valley-graduate',
  'scenario-winner',
] as const;
export type TownGrowth = {
  node: number;
  level: number;
  supplied: number;
  streak: number;
  total: number;
};
export type RegionResult = {
  outcome: 'won' | 'missed';
  at: number;
  delivered: number;
  profit: number;
  punctuality: number;
  departures: number;
  bottlenecks: [string, number][];
};
export type RegionState = {
  mode: SessionMode;
  seed: number;
  settings: {
    progression: boolean;
    growth: boolean;
    weather: boolean;
    events: boolean;
  };
  second: number;
  window: number;
  ledgerCursor: number;
  startedEntry: number;
  towns: TownGrowth[];
  research: ResearchId[];
  tutorial: TutorialAction[];
  achievements: string[];
  interventions: { train: number; departures: number }[];
  resolved: number;
  waitSeconds: Record<string, number>;
  delivered: number;
  mountainCoal: number;
  builtDelivered: number;
  passengers: number;
  deferredInspections: number[];
  result: RegionResult | null;
};
export function createRegion(
  sim: Simulation,
  mode: SessionMode = 'sandbox',
  seed = 1885,
): RegionState {
  if (
    !['sandbox', 'campaign', ...Object.keys(SCENARIOS)].includes(mode) ||
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff
  )
    throw new Error('Choose a valid session mode and unsigned 32-bit seed.');
  return {
    mode,
    seed,
    settings: {
      progression: mode === 'campaign',
      growth: mode !== 'sandbox',
      weather: mode !== 'sandbox',
      events: mode !== 'sandbox',
    },
    second: Math.floor(sim.elapsed + 1e-7),
    window: Math.floor((sim.elapsed + 1e-7) / 600),
    ledgerCursor: sim.economy.ledger.length,
    startedEntry: sim.economy.ledger.length,
    towns: sim.network.stations.map((s) => ({
      node: s.node,
      level: 0,
      supplied: 0,
      streak: 0,
      total: 0,
    })),
    research: [],
    tutorial: [],
    achievements: [],
    interventions: [],
    resolved: 0,
    waitSeconds: {},
    delivered: 0,
    mountainCoal: 0,
    builtDelivered: 0,
    passengers: 0,
    deferredInspections: [],
    result: null,
  };
}
export function initializeSession(sim: Simulation, mode: SessionMode) {
  if (mode === 'sandbox') return;
  const ids =
    mode === 'mountain'
      ? [3]
      : mode === 'passenger'
        ? [1, 5]
        : mode === 'river'
          ? [9]
          : [3, 4];
  sim.fleet.units.forEach((u, i) => {
    u.owned = ids.includes(i);
    sim.trains[i].held = !u.owned || mode === 'campaign' || mode === 'river';
  });
  sim.treasury = mode === 'campaign' ? 145000 : 220000;
  sim.economy.ledger[0].amount = sim.treasury;
  sim.economy.ledger[0].balance = sim.treasury;
  if (mode === 'campaign' || mode === 'junction') {
    sim.services[3] = planService(
      sim.network,
      3,
      'Millbrook relief',
      [3, 4],
      3.5,
    );
    sim.fleet.units[3].engine = 3;
    sim.fleet.units[4].engine = 6;
  }
  if (mode === 'campaign') {
    sim.services[3] = planService(
      sim.network,
      3,
      'Millbrook grain',
      [3, 4],
      3.5,
    );
    sim.services[4] = planService(
      sim.network,
      4,
      'Riverside provisions',
      [4, 7],
      3.5,
    );
    sim.economy.services[4].wagon = 'box';
    sim.fleet.units[4].consist = ['box', 'box', 'box'];
  }
  if (mode === 'mountain') {
    sim.services[3] = planService(sim.network, 3, 'Granite coal', [9, 4], 3.5);
    sim.fleet.units[3].engine = 8;
  }
  if (mode === 'river') {
    sim.services[9] = planService(
      sim.network,
      9,
      'River connection',
      [4, 7],
      3.5,
    );
    sim.economy.services[9].wagon = 'coaches';
    sim.fleet.units[9].consist = ['coaches', 'coaches', 'coaches'];
  }
  sim.events = [
    `${mode === 'campaign' ? 'Campaign: build a dependable regional railway' : SCENARIOS[mode].name}. Open Region & goals for your next action.`,
  ];
}
function hash(seed: number, slot: number) {
  let n = (seed ^ Math.imul(slot + 1, 0x45d9f3b)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b) >>> 0;
  return (n ^ (n >>> 16)) >>> 0;
}
export function conditions(sim: Simulation, at = sim.elapsed) {
  const enabled = sim.region.settings.weather;
  const season = enabled
    ? (['spring', 'summer', 'autumn', 'winter'] as const)[
        Math.floor((at + 1e-7) / 900) % 4
      ]
    : 'summer';
  const slot = Math.floor((at + 1e-7) / 180),
    roll = hash(sim.region.seed, slot) % 5;
  const weather: 'clear' | 'fog' | 'rain' | 'snow' =
    !enabled || roll < 2
      ? 'clear'
      : roll === 2
        ? 'fog'
        : season === 'winter'
          ? 'snow'
          : 'rain';
  return {
    season,
    weather,
    speed:
      weather === 'snow'
        ? 0.85
        : weather === 'rain'
          ? 0.92
          : weather === 'fog'
            ? 0.9
            : 1,
    water: enabled
      ? season === 'spring'
        ? 0.16
        : season === 'summer'
          ? -0.1
          : 0.04
      : 0,
    nextAt: (slot + 1) * 180,
  };
}
export function forecast(sim: Simulation) {
  if (!sim.region.settings.events) return null;
  const cycle = Math.floor((sim.elapsed + 1e-7) / 1200);
  const bridges = sim.network.edges.filter(
    (e) => e.bridgeLength > 0 && !e.built,
  );
  const edge = bridges.length
    ? bridges[hash(sim.region.seed, cycle) % bridges.length].id
    : null;
  const deferred = sim.region.deferredInspections.includes(cycle);
  const start = cycle * 1200 + 420 + (deferred ? 300 : 0),
    end = start + 120;
  return {
    cycle,
    edge,
    start,
    end,
    active: sim.elapsed >= start - 1e-7 && sim.elapsed < end - 1e-7,
    deferred,
    festivalNode:
      sim.network.stations[
        hash(sim.region.seed + 17, cycle) % sim.network.stations.length
      ].node,
    festivalStart: cycle * 1200 + 780,
    festivalEnd: cycle * 1200 + 1020,
  };
}
export function inspectionBlocks(sim: Simulation, edges: string[]) {
  const event = forecast(sim);
  return !!event?.active && !!event.edge && edges.includes(event.edge);
}
export function deferInspection(sim: Simulation) {
  const event = forecast(sim);
  if (!event?.edge || event.deferred || sim.elapsed >= event.start)
    throw new Error(
      'Defer an announced inspection before it begins, once per cycle.',
    );
  if (!sim.canAfford(2500))
    throw new Error(
      'Inspection rescheduling costs $2,500. Wait safely or route around the bridge.',
    );
  pay(sim, 2500, 'maintenance', 'Bridge inspection rescheduled');
  sim.region.deferredInspections.push(event.cycle);
}
export function townRate(sim: Simulation, node: number) {
  if (
    !sim.region.settings.growth &&
    !sim.region.settings.weather &&
    !sim.region.settings.events
  )
    return 2;
  const level = sim.region.settings.growth
    ? (sim.region.towns.find((t) => t.node === node)?.level ?? 0)
    : 0;
  const event = forecast(sim);
  return (
    2 +
    level +
    Number(conditions(sim).season === 'summer' && sim.region.settings.weather) +
    Number(
      !!event &&
        event.festivalNode === node &&
        sim.elapsed >= event.festivalStart &&
        sim.elapsed < event.festivalEnd,
    ) *
      2
  );
}
export function recordAction(sim: Simulation, action: TutorialAction) {
  if (!sim.region.tutorial.includes(action)) sim.region.tutorial.push(action);
}
export function recordIntervention(sim: Simulation, id?: number) {
  for (const t of sim.trains)
    if (
      (id === undefined || t.id === id) &&
      t.motion.wait &&
      [
        'block',
        'junction',
        'platform',
        'capacity',
        'deadlock',
        'headway',
      ].includes(t.motion.wait.kind) &&
      !sim.region.interventions.some((i) => i.train === t.id)
    )
      sim.region.interventions.push({
        train: t.id,
        departures: t.motion.departures,
      });
}
export function researchReason(sim: Simulation, id: ResearchId) {
  const r = sim.region,
    item = RESEARCH[id];
  if (!item) return 'Choose a research project.';
  if (r.research.includes(id)) return 'Already researched.';
  if (item.requires.some((key) => !r.research.includes(key as ResearchId)))
    return 'Research Civil engineering first.';
  if (id === 'civil' && r.delivered < 42)
    return 'Deliver 42 units to fund practical engineering knowledge.';
  if (
    id === 'freight' &&
    (r.delivered < 168 || !r.towns.some((t) => t.level > 0))
  )
    return 'Deliver 168 units and supply a town in two consecutive ten-minute windows.';
  const { departures, punctuality } = serviceScore(sim);
  if (id === 'express' && (departures < 12 || punctuality < 70))
    return 'Record 12 departures with at least 70% punctuality.';
  if (!sim.canAfford(item.price))
    return `Research costs $${item.price.toLocaleString()}.`;
  return undefined;
}
export function research(sim: Simulation, id: ResearchId) {
  const reason = researchReason(sim, id);
  if (reason) throw new Error(reason);
  pay(
    sim,
    RESEARCH[id].price,
    'construction',
    `Research: ${RESEARCH[id].name}`,
  );
  sim.region.research.push(id);
  if (sim.region.delivered) recordAction(sim, 'invest');
}
export function requireResearch(sim: Simulation, id: ResearchId) {
  if (sim.region.settings.progression && !sim.region.research.includes(id))
    throw new Error(`Research ${RESEARCH[id].name} in Region & goals first.`);
}
export function engineResearch(engine: number): ResearchId | null {
  return [0, 8, 9, 10, 11].includes(engine)
    ? 'freight'
    : [1, 5, 7].includes(engine)
      ? 'express'
      : null;
}
export function serviceScore(sim: Simulation) {
  const departures = sim.trains.reduce((n, t) => n + t.motion.departures, 0);
  const onTime = sim.trains.reduce((n, t) => n + t.motion.onTime, 0);
  return {
    departures,
    punctuality: departures ? (onTime / departures) * 100 : 100,
  };
}
function achieved(sim: Simulation) {
  const r = sim.region,
    score = serviceScore(sim);
  switch (r.mode) {
    case 'mountain':
      return r.mountainCoal >= 126;
    case 'junction':
      return r.delivered >= 210 && r.resolved > 0;
    case 'river':
      return (
        r.builtDelivered >= 84 &&
        sim.construction.some(
          (c) => c.action === 'build' && c.cost.bridges > 0 && !c.reversed,
        )
      );
    case 'passenger':
      return (
        r.passengers >= 252 && score.departures >= 12 && score.punctuality >= 70
      );
    case 'campaign':
      return (
        TUTORIAL.every((a) => r.tutorial.includes(a.id)) &&
        r.delivered >= 420 &&
        r.towns.some((t) => t.level > 0) &&
        r.research.length >= 2
      );
    default:
      return false;
  }
}
export function tickRegion(sim: Simulation) {
  const r = sim.region;
  // Process only newly appended journal entries; long sessions never rescan delivery history per tick.
  for (const l of sim.economy.ledger.slice(r.ledgerCursor)) {
    if (l.category === 'delivery' && l.quantity) {
      r.delivered += l.quantity;
      if (l.cargo === 'passengers') r.passengers += l.quantity;
      if (l.cargo === 'coal' && l.source === 9 && l.destination === 4)
        r.mountainCoal += l.quantity;
      if (l.builtTrack) r.builtDelivered += l.quantity;
      let town = r.towns.find((t) => t.node === l.destination);
      if (!town) {
        town = {
          node: l.destination!,
          level: 0,
          supplied: 0,
          streak: 0,
          total: 0,
        };
        r.towns.push(town);
      }
      town.total += l.quantity;
      if (r.settings.growth) town.supplied += l.quantity;
      recordAction(sim, 'delivery');
    }
    if (
      r.delivered &&
      ['wagon', 'construction'].includes(l.category) &&
      l.amount < 0
    )
      recordAction(sim, 'invest');
  }
  r.ledgerCursor = sim.economy.ledger.length;
  for (const i of r.interventions)
    if (sim.trains[i.train].motion.departures > i.departures) {
      r.resolved++;
      recordAction(sim, 'congestion');
    }
  r.interventions = r.interventions.filter(
    (i) => sim.trains[i.train].motion.departures <= i.departures,
  );
  const second = Math.floor(sim.elapsed + 1e-7);
  if (second === r.second) return;
  r.second = second;
  for (const t of sim.trains)
    if (sim.fleet.units[t.id].owned && t.motion.wait) {
      const key = t.motion.wait.kind;
      r.waitSeconds[key] = (r.waitSeconds[key] ?? 0) + 1;
    }
  const window = Math.floor((sim.elapsed + 1e-7) / 600);
  if (window > r.window) {
    r.window = window;
    for (const t of r.towns) {
      t.streak =
        r.settings.growth && t.supplied >= 24 ? Math.min(2, t.streak + 1) : 0;
      if (t.streak === 2 && t.level < 3) {
        t.level++;
        t.streak = 0;
        sim.events.unshift(
          `${sim.network.nodes.find((n) => n.id === t.node)?.name ?? 'Town'} grew to level ${t.level}. Reliable supplies support more homes and demand.`,
        );
        sim.events = sim.events.slice(0, 30);
      }
      t.supplied = 0;
    }
  }
  const award = (id: string, yes: boolean) => {
    if (yes && !r.achievements.includes(id)) r.achievements.push(id);
  };
  award('first-delivery', r.delivered > 0);
  award(
    'town-builder',
    r.towns.some((t) => t.level > 0),
  );
  const score = serviceScore(sim);
  award('reliable-railway', score.departures >= 12 && score.punctuality >= 70);
  const won = achieved(sim),
    scenario =
      r.mode !== 'sandbox' && r.mode !== 'campaign' ? SCENARIOS[r.mode] : null;
  if (
    !r.result &&
    (won || (scenario && sim.elapsed >= scenario.duration - 1e-7))
  ) {
    r.result = {
      outcome: won ? 'won' : 'missed',
      at: sim.elapsed,
      delivered: r.delivered,
      profit: accounts(sim.economy).profit,
      ...score,
      bottlenecks: Object.entries(r.waitSeconds)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3),
    };
    award(r.mode === 'campaign' ? 'valley-graduate' : 'scenario-winner', won);
  }
}
export function setRegionSetting(
  sim: Simulation,
  key: keyof RegionState['settings'],
  value: boolean,
) {
  if (sim.region.mode !== 'sandbox')
    throw new Error(
      'Campaign and scenario rules are fixed. Start a sandbox to customize them.',
    );
  if (!(key in sim.region.settings) || typeof value !== 'boolean')
    throw new Error('Choose a region setting.');
  sim.region.settings[key] = value;
  if (key === 'growth')
    for (const t of sim.region.towns) {
      t.supplied = 0;
      t.streak = 0;
    }
}
export function validateRegion(sim: Simulation) {
  const r = sim.region;
  const fail = () => {
    throw new Error('Invalid region progression save.');
  };
  const natural = (n: number) => Number.isSafeInteger(n) && n >= 0;
  if (
    !r ||
    !['sandbox', 'campaign', ...Object.keys(SCENARIOS)].includes(r.mode) ||
    !natural(r.seed) ||
    r.seed > 0xffffffff ||
    !r.settings ||
    Object.keys(r.settings).length !== 4 ||
    ['progression', 'growth', 'weather', 'events'].some(
      (k) =>
        typeof r.settings[k as keyof RegionState['settings']] !== 'boolean',
    ) ||
    (r.mode !== 'sandbox' &&
      (!r.settings.growth ||
        !r.settings.weather ||
        !r.settings.events ||
        r.settings.progression !== (r.mode === 'campaign'))) ||
    r.second !== Math.floor(sim.elapsed + 1e-7) ||
    r.window !== Math.floor((sim.elapsed + 1e-7) / 600) ||
    !natural(r.ledgerCursor) ||
    r.ledgerCursor > sim.economy.ledger.length ||
    !natural(r.startedEntry) ||
    r.startedEntry > r.ledgerCursor ||
    (r.mode !== 'sandbox' && sim.economy.mode !== 'standard')
  )
    fail();
  const unique = (a: unknown, allowed: readonly string[]) =>
    Array.isArray(a) &&
    new Set(a).size === a.length &&
    a.every((x) => allowed.includes(x));
  if (
    !unique(r.research, Object.keys(RESEARCH)) ||
    !unique(
      r.tutorial,
      TUTORIAL.map((t) => t.id),
    ) ||
    !unique(r.achievements, ACHIEVEMENTS) ||
    !Array.isArray(r.towns) ||
    new Set(r.towns.map((t) => t.node)).size !== r.towns.length ||
    r.towns.some(
      (t) =>
        !natural(t.node) ||
        !natural(t.level) ||
        t.level > 3 ||
        !natural(t.supplied) ||
        !natural(t.total) ||
        t.supplied > t.total ||
        !natural(t.streak) ||
        t.streak > 1,
    ) ||
    r.research.some((id) =>
      RESEARCH[id].requires.some(
        (parent) => !r.research.includes(parent as ResearchId),
      ),
    )
  )
    fail();
  if (
    ![
      r.delivered,
      r.mountainCoal,
      r.builtDelivered,
      r.passengers,
      r.resolved,
    ].every(natural) ||
    r.delivered > sim.delivered ||
    [r.mountainCoal, r.builtDelivered, r.passengers].some(
      (n) => n > r.delivered,
    ) ||
    r.towns.reduce((n, t) => n + t.total, 0) !== r.delivered ||
    !r.waitSeconds ||
    Object.entries(r.waitSeconds).some(
      ([k, v]) =>
        ![
          'block',
          'junction',
          'platform',
          'capacity',
          'deadlock',
          'headway',
          'departure',
          'hold',
          'depot',
          'collision',
          'direction',
          'safety',
        ].includes(k) || !natural(v),
    ) ||
    !Array.isArray(r.interventions) ||
    new Set(r.interventions.map((i) => i.train)).size !==
      r.interventions.length ||
    r.interventions.some(
      (i) =>
        !natural(i.train) ||
        !sim.trains[i.train] ||
        !natural(i.departures) ||
        i.departures > sim.trains[i.train].motion.departures,
    ) ||
    !Array.isArray(r.deferredInspections) ||
    new Set(r.deferredInspections).size !== r.deferredInspections.length ||
    r.deferredInspections.some(
      (n) => !natural(n) || n > Math.floor((sim.elapsed + 1e-7) / 1200),
    )
  )
    fail();
  const deliveries = sim.economy.ledger
    .slice(r.startedEntry, r.ledgerCursor)
    .filter((l) => l.category === 'delivery');
  const sum = (filter: (l: (typeof deliveries)[number]) => boolean) =>
    deliveries.filter(filter).reduce((n, l) => n + (l.quantity ?? 0), 0);
  if (
    r.delivered !== sum(() => true) ||
    r.passengers !== sum((l) => l.cargo === 'passengers') ||
    r.mountainCoal !==
      sum((l) => l.cargo === 'coal' && l.source === 9 && l.destination === 4) ||
    r.builtDelivered !== sum((l) => !!l.builtTrack) ||
    r.towns.some((t) => t.total !== sum((l) => l.destination === t.node)) ||
    r.research.some(
      (id) =>
        !sim.economy.ledger.some(
          (l) =>
            l.category === 'construction' &&
            l.note === `Research: ${RESEARCH[id].name}` &&
            l.amount === -RESEARCH[id].price,
        ),
    )
  )
    fail();
  if (
    r.result &&
    (!['won', 'missed'].includes(r.result.outcome) ||
      !Number.isFinite(r.result.at) ||
      r.result.at < 0 ||
      r.result.at > sim.elapsed ||
      !natural(r.result.delivered) ||
      r.result.delivered > r.delivered ||
      !Number.isSafeInteger(r.result.profit) ||
      !Number.isFinite(r.result.punctuality) ||
      r.result.punctuality < 0 ||
      r.result.punctuality > 100 ||
      !natural(r.result.departures) ||
      !Array.isArray(r.result.bottlenecks) ||
      r.result.bottlenecks.length > 3 ||
      r.result.bottlenecks.some(
        (b) =>
          !Array.isArray(b) ||
          b.length !== 2 ||
          typeof b[0] !== 'string' ||
          !natural(b[1]),
      ))
  )
    fail();
}
