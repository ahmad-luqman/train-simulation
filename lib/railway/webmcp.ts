import { locomotives } from './data';
import { ENGINES } from './fleet';
import type { Simulation } from './simulation';
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type Registry = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function registerRailwayTools(
  sim: Simulation,
  follow: (id: number) => void,
  refresh: () => void,
) {
  const registry = (document as Document & { modelContext?: Registry })
    .modelContext;
  if (!registry?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const getId = (input: unknown) => {
    if (!input || typeof input !== 'object')
      throw new Error('Provide a trainId.');
    const id = (input as { trainId: unknown }).trainId;
    if (typeof id !== 'number' || !Number.isInteger(id) || !locomotives[id])
      throw new Error('trainId must be an integer from 0 to 11.');
    return id;
  };
  const tools: Tool[] = [
    {
      name: 'get_railway_state',
      description:
        'Read the railway treasury, delivered units, and all locomotive statuses.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({
        treasury: sim.treasury,
        delivered: sim.delivered,
        paused: sim.paused,
        trains: sim.trains.map((t) => ({
          id: t.id,
          name: ENGINES[sim.fleet.units[t.id].engine].name,
          owned: sim.fleet.units[t.id].owned,
          condition: sim.fleet.units[t.id].condition,
          status: t.held ? 'On hold' : t.status,
          cars: t.cars,
          revenue: t.revenue,
        })),
      }),
    },
    {
      name: 'follow_train',
      description:
        'Follow a visible locomotive, or wait in the current view until a queued locomotive is dispatched.',
      inputSchema: {
        type: 'object',
        properties: { trainId: { type: 'integer', minimum: 0, maximum: 11 } },
        required: ['trainId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        const id = getId(input);
        follow(id);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        return {
          following: id,
          name: locomotives[id].name,
          waitingForDispatch: !sim.visible(sim.trains[id]),
        };
      },
    },
    {
      name: 'set_train_hold',
      description:
        'Hold or release a locomotive using the same hold control as the train inspector.',
      inputSchema: {
        type: 'object',
        properties: {
          trainId: { type: 'integer', minimum: 0, maximum: 11 },
          held: { type: 'boolean' },
        },
        required: ['trainId', 'held'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        const id = getId(input),
          held = (input as { held: unknown }).held;
        if (typeof held !== 'boolean')
          throw new Error('held must be a boolean.');
        sim.setHold(id, held);
        refresh();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        return { trainId: id, held };
      },
    },
  ];
  for (const tool of tools) {
    try {
      Promise.resolve(
        registry.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {
      /* Optional browser support must not interrupt the game. */
    }
  }
  return () => lifecycle.abort();
}
