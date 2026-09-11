'use client';
import { useOfficeFocus } from '@/hooks/use-office-focus';
/* eslint-disable react/react-compiler -- Samples the authoritative mutable simulation. */
import { setMoneyMode } from '@/lib/railway/economy';
import { useState } from 'react';
import { X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  CARGO,
  WAGONS,
  TARIFF,
  STORAGE,
  OFFERS,
  RECIPES,
  PRODUCERS,
  accounts,
  supply,
  demand,
  acceptContract,
  borrow,
  repay,
  refit,
  type Cargo,
  type Wagon,
} from '@/lib/railway/economy';
import { locomotives, money } from '@/lib/railway/data';
import { MAP_VIEWBOX } from '@/lib/railway/map';
import type { Simulation } from '@/lib/railway/simulation';

export function EconomyOffice({
  sim,
  selected,
  select,
  close,
  changed,
}: {
  sim: Simulation;
  selected: number;
  select: (id: number) => void;
  close: () => void;
  changed: () => void;
}) {
  const office = useOfficeFocus(close);
  const [cargo, setCargo] = useState<Cargo>('timber');
  const [feedback, setFeedback] = useState('');
  const [page, setPage] = useState(0);
  const e = sim.economy,
    totals = accounts(e),
    service = e.services[selected],
    train = sim.trains[selected];
  const name = (node: number) =>
    sim.network.nodes.find((n) => n.id === node)?.name ?? 'Station';
  const act = (action: () => void, message: string) => {
    try {
      action();
      setFeedback(message);
      changed();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Unable to complete this action.',
      );
    }
  };
  const ledger = [...e.ledger].reverse().slice(page * 30, (page + 1) * 30);
  return (
    <section
      ref={office}
      className="network-editor economy-office"
      aria-label="Railway economy"
    >
      <div className="network-editor-heading">
        <h2>Economy office</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close economy office"
        >
          <X size={18} />
        </button>
      </div>
      <div className="economy-summary">
        <div>
          <span>Cash</span>
          <strong>{money(sim.treasury)}</strong>
        </div>
        <div>
          <span>Debt</span>
          <strong>{money(e.debt)}</strong>
        </div>
        <div>
          <span>Revenue</span>
          <strong>{money(totals.revenue)}</strong>
        </div>
        <div>
          <span>Expenses</span>
          <strong>{money(totals.expenses)}</strong>
        </div>
        <div className="economy-net">
          <span>Net operating profit</span>
          <strong className={totals.profit < 0 ? 'economy-loss' : ''}>
            {money(totals.profit)}
          </strong>
        </div>
      </div>
      {sim.treasury < 0 && (
        <p className="economy-warning">
          Cash is overdrawn. Trains keep working; use a loan, improve a route,
          or enable unlimited funds to recover.
        </p>
      )}
      {feedback && (
        <output className="economy-feedback" aria-live="polite">
          {feedback}
        </output>
      )}
      <Tabs defaultValue="supply">
        <TabsList className="economy-tabs">
          <TabsTrigger value="supply">Supply</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>
        <TabsContent value="supply">
          <label htmlFor="economy-cargo">
            Inventory overlay
            <NativeSelect
              id="economy-cargo"
              value={cargo}
              onChange={(event) => setCargo(event.target.value as Cargo)}
            >
              {CARGO.map((c) => (
                <NativeSelectOption key={c} value={c}>
                  {c[0].toUpperCase() + c.slice(1)} · {money(TARIFF[c])}/unit
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <svg
            className="economy-map"
            viewBox={MAP_VIEWBOX}
            aria-label={`${cargo} supply and demand map; full amounts listed below`}
          >
            {sim.network.edges.map((edge) => (
              <polyline
                key={edge.id}
                points={edge.points.map((p) => `${p.x},${p.z}`).join(' ')}
                fill="none"
                stroke="#bac8b9"
                strokeWidth={1.5}
              />
            ))}
            {e.towns.map((town) => {
              const n = sim.network.nodes.find((n) => n.id === town.node)!;
              const need = demand(town, cargo);
              return (
                <g key={town.node}>
                  <circle
                    cx={n.x}
                    cy={n.z}
                    r={supply(town, cargo) > 0 ? 8 : 5}
                    fill={
                      supply(town, cargo) > 0
                        ? '#385d43'
                        : need > 0
                          ? '#bf7a32'
                          : '#96a191'
                    }
                  />
                  <text x={n.x} y={n.z - 13} textAnchor="middle">
                    {n.name}
                  </text>
                  <text x={n.x} y={n.z + 20} textAnchor="middle">
                    {town.stock[cargo]} stock / {need} demand
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="economy-small">
            Green: available to load · Amber: demand. Consumer stock stays in
            town. Each accepted unit earns {money(TARIFF[cargo])}. Storage:{' '}
            {STORAGE} units per commodity.
          </p>
          <div className="economy-table-scroll">
            <table className="economy-table">
              <caption>
                {cargo[0].toUpperCase() + cargo.slice(1)} across the valley
              </caption>
              <thead>
                <tr>
                  <th>Station</th>
                  <th>Stock</th>
                  <th>Demand</th>
                </tr>
              </thead>
              <tbody>
                {e.towns.map((town) => (
                  <tr key={town.node}>
                    <th>
                      {name(town.node)}
                      <small>
                        {PRODUCERS.some(
                          (p) => p.node === town.node && p.cargo === cargo,
                        )
                          ? 'Producer · 24/min'
                          : (RECIPES.find(
                              (r) =>
                                r.node === town.node &&
                                (r.input === cargo || r.output === cargo),
                            )?.label ??
                            (cargo === 'passengers'
                              ? 'Waiting passengers · 24/min'
                              : demand(town, cargo) > 0
                                ? 'Town consumer'
                                : 'No acceptance'))}
                      </small>
                    </th>
                    <td>
                      {town.stock[cargo]} / {STORAGE}
                    </td>
                    <td>{demand(town, cargo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Three local supply chains</h3>
          <ol className="economy-chains">
            <li>Pinecrest timber → Riverside sawmill → lumber to towns.</li>
            <li>
              Millbrook / Fairwater grain → Grand Junction mill → flour to
              towns.
            </li>
            <li>Coalhaven coal → Grand Junction industry → goods to towns.</li>
          </ol>
          <p>
            Processors turn one raw unit into one finished unit, up to 24 per
            minute. Production pauses when output storage is full. Towns consume
            up to 24 finished units per minute; supply beyond their storage
            limit earns nothing.
          </p>
        </TabsContent>
        <TabsContent value="services">
          <label htmlFor="economy-train">
            Train
            <NativeSelect
              id="economy-train"
              value={selected}
              onChange={(event) => select(Number(event.target.value))}
            >
              {locomotives.map((l, id) => (
                <NativeSelectOption key={id} value={id}>
                  {l.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <h3>{WAGONS[service.wagon].label}</h3>
          <p>
            {train.cars} wagons · {train.cars * 18} units capacity ·{' '}
            {Math.floor(sim.services[selected].dwell * 12)} units loading limit
            per call.
          </p>
          <p className="economy-small">
            Loading rate: 12 units/second of configured dwell. Increase dwell in
            Build & route → Services to fill longer trains. The service
            automatically loads compatible stock for its next scheduled call.
          </p>
          {service.manifest ? (
            <p className="economy-manifest">
              <strong>
                {service.manifest.quantity} {service.manifest.cargo} aboard
              </strong>
              <br />
              {name(service.manifest.source)} →{' '}
              {name(service.manifest.destination)}
              <br />
              Loaded{' '}
              {Math.floor((sim.elapsed - service.manifest.loadedAt) / 60)}{' '}
              simulation minutes ago.
            </p>
          ) : (
            <p className="economy-manifest">
              Empty · waiting for the next admitted departure.
            </p>
          )}
          {service.warning && (
            <p className="economy-warning">{service.warning}</p>
          )}
          <button
            className="button"
            onClick={() =>
              act(
                () => sim.stopForEditing(selected),
                'Train will stop at the next station.',
              )
            }
          >
            Stop at next station
          </button>{' '}
          <button
            className="button"
            disabled={!train.held}
            onClick={() =>
              act(() => {
                train.held = false;
              }, 'Train released.')
            }
          >
            Release train
          </button>
          <label htmlFor="economy-refit">
            Refit wagon family · $2,500
            <NativeSelect
              id="economy-refit"
              value={service.wagon}
              disabled={train.motion.started || !!service.manifest}
              onChange={(event) =>
                act(
                  () => refit(sim, selected, event.target.value as Wagon),
                  'Wagons refitted.',
                )
              }
            >
              {Object.entries(WAGONS).map(([key, value]) => (
                <NativeSelectOption key={key} value={key}>
                  {value.label} · {value.cargo.join(' / ')}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <p className="economy-small">
            Refit an empty train at a station or depot. Additional wagons cost
            $8,500 in the train inspector and use the selected family. Cargo
            aboard must be delivered before editing a service.
          </p>
          <h3>Service accounts</h3>
          <p className="economy-small">
            Direct delivery and contract revenue less fuel, crew and
            maintenance. Shared infrastructure and interest appear in company
            accounts.
          </p>
          <div className="economy-table-scroll">
            <table className="economy-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Revenue</th>
                  <th>Costs</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {sim.trains.map((t) => {
                  const a = accounts(e, t.id);
                  return (
                    <tr key={t.id}>
                      <th>
                        <button
                          className="economy-link"
                          onClick={() => select(t.id)}
                        >
                          {locomotives[t.id].name}
                        </button>
                        <small>
                          {WAGONS[e.services[t.id].wagon].label} ·{' '}
                          {e.services[t.id].emptyRuns} empty departures
                        </small>
                      </th>
                      <td>{money(a.revenue)}</td>
                      <td>{money(a.expenses)}</td>
                      <td className={a.profit < 0 ? 'economy-loss' : ''}>
                        {money(a.profit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="contracts">
          <p>
            Deadlines start when you accept and use simulation time. Only
            accepted deliveries count. A missed contract charges the stated fee;
            you can try again.
          </p>
          {OFFERS.map((o, id) => {
            const active = e.contracts.find(
              (c) =>
                c.status === 'active' &&
                c.cargo === o.cargo &&
                c.destination === o.destination,
            );
            return (
              <article className="economy-contract" key={id}>
                <h3>{o.label}</h3>
                <p>
                  {o.required} {o.cargo} to {name(o.destination)} ·{' '}
                  {o.duration / 60} minutes
                  <br />
                  <strong>{money(o.reward)} reward</strong> · {money(o.penalty)}{' '}
                  missed deadline fee
                </p>
                {active ? (
                  <>
                    <progress
                      value={active.delivered}
                      max={active.required}
                      aria-label={`${o.label} delivered`}
                    />
                    <p>
                      {active.delivered} / {active.required} delivered ·{' '}
                      {Math.max(
                        0,
                        Math.ceil((active.deadline - sim.elapsed) / 60),
                      )}{' '}
                      minutes left
                    </p>
                  </>
                ) : (
                  <button
                    className="button"
                    onClick={() =>
                      act(
                        () => acceptContract(sim, id),
                        'Contract accepted. Its deadline starts now.',
                      )
                    }
                  >
                    Accept contract
                  </button>
                )}
              </article>
            );
          })}
          <h3>Contract history</h3>
          {!e.contracts.some((c) => c.status !== 'active') ? (
            <p>No completed or missed contracts yet.</p>
          ) : (
            <ul>
              {e.contracts
                .filter((c) => c.status !== 'active')
                .slice(-12)
                .reverse()
                .map((c) => (
                  <li key={c.id}>
                    #{c.id} · {c.cargo} to {name(c.destination)} · {c.status} ·{' '}
                    {c.delivered}/{c.required}
                  </li>
                ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="accounts">
          <h3>Financing</h3>
          <p>
            Credit limit: $100,000. Borrow or repay $25,000 at a time. Interest
            is 0.2% of outstanding debt per simulation minute:{' '}
            <strong>{money(Math.ceil(e.debt * 0.002))}/minute now</strong>. A
            $25,000 loan costs $50/minute until repaid.
          </p>
          <div className="economy-actions">
            <button
              className="button"
              disabled={e.debt >= 100000}
              onClick={() => act(() => borrow(sim), '$25,000 loan received.')}
            >
              Borrow $25,000
            </button>
            <button
              className="button"
              disabled={e.debt === 0 || sim.treasury < Math.min(25000, e.debt)}
              onClick={() => act(() => repay(sim), 'Loan principal repaid.')}
            >
              Repay $25,000
            </button>
          </div>
          <label htmlFor="economy-mode">
            Money mode
            <NativeSelect
              id="economy-mode"
              value={e.mode}
              onChange={(event) =>
                act(() => {
                  setMoneyMode(sim, event.target.value as typeof e.mode);
                }, 'Money mode changed. All transactions remain in the ledger.')
              }
            >
              <NativeSelectOption value="standard">
                Standard economy
              </NativeSelectOption>
              <NativeSelectOption value="unlimited">
                Sandbox · unlimited purchasing funds
              </NativeSelectOption>
            </NativeSelect>
          </label>
          <p className="economy-small">
            Unlimited mode grants exactly the cash needed for otherwise
            unaffordable purchases. Production, costs and contracts continue.
            Grants and loans do not count as profit.
          </p>
          <details>
            <summary>Tariffs and operating costs</summary>
            <p>
              Tariffs per accepted unit:{' '}
              {CARGO.map((c) => `${c} ${money(TARIFF[c])}`).join(' · ')}. No
              hidden distance, freshness or punctuality multipliers.
            </p>
            <p>
              Billed each complete simulation minute: crew $6/train; maintenance
              $3/train + $1/wagon; fuel $0.30 per scene unit travelled (about
              $54/km). Track upkeep $0.02 per scene unit of track plus
              $1/platform. Fuel and shared infrastructure round up to whole
              dollars. Holds still incur crew, maintenance and infrastructure
              costs.
            </p>
          </details>
          <h3>Cash ledger</h3>
          <p className="economy-small">
            Opening balance + every signed entry = current cash. Capital
            purchases, refunds and financing stay separate from operating
            profit. Unbilled partial-minute costs accrue until the next full
            minute.
          </p>
          <div className="economy-table-scroll">
            <table className="economy-table">
              <thead>
                <tr>
                  <th>Minute / entry</th>
                  <th>Amount</th>
                  <th>Cash</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.id}>
                    <th>
                      {(l.at / 60).toFixed(1)} · {l.category}
                      <small>
                        {l.note}
                        {l.train !== undefined
                          ? ` · ${locomotives[l.train].name}`
                          : ''}
                        {l.rejected ? ` · ${l.rejected} rejected` : ''}
                      </small>
                    </th>
                    <td>
                      {l.amount < 0 ? '−' : '+'}
                      {money(Math.abs(l.amount))}
                    </td>
                    <td>{money(l.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="economy-actions">
            <button
              className="button"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Newer
            </button>
            <span>
              Page {page + 1} / {Math.max(1, Math.ceil(e.ledger.length / 30))}
            </span>
            <button
              className="button"
              disabled={(page + 1) * 30 >= e.ledger.length}
              onClick={() => setPage(page + 1)}
            >
              Older
            </button>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
