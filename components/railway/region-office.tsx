'use client';
/* eslint-disable react/react-compiler -- Samples the authoritative mutable simulation. */
import { useState } from 'react';
import { X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { money } from '@/lib/railway/data';
import {
  conditions,
  forecast,
  deferInspection,
  RESEARCH,
  research,
  researchReason,
  SCENARIOS,
  TUTORIAL,
  setRegionSetting,
  serviceScore,
  type ResearchId,
} from '@/lib/railway/region';
import type { Simulation } from '@/lib/railway/simulation';

export function RegionOffice({
  sim,
  close,
  changed,
  navigate,
  newSession,
}: {
  sim: Simulation;
  close: () => void;
  changed: () => void;
  navigate: (panel: string) => void;
  newSession: () => void;
}) {
  const [feedback, setFeedback] = useState('');
  const r = sim.region,
    sky = conditions(sim),
    event = forecast(sim),
    score = serviceScore(sim);
  const scenario =
    r.mode !== 'sandbox' && r.mode !== 'campaign' ? SCENARIOS[r.mode] : null;
  const act = (fn: () => void, message: string) => {
    try {
      fn();
      changed();
      setFeedback(message);
    } catch (e) {
      setFeedback(
        e instanceof Error ? e.message : 'Unable to complete action.',
      );
    }
  };
  return (
    <section
      className="network-editor economy-office region-office"
      aria-label="Region and goals"
    >
      <div className="network-editor-heading">
        <h2>Region & goals</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close region office"
        >
          <X size={18} />
        </button>
      </div>
      <p>
        <strong>
          {scenario?.name ??
            (r.mode === 'campaign'
              ? 'A railway for the valley'
              : 'Free sandbox')}
        </strong>{' '}
        · {Math.floor(sim.elapsed / 60)} minutes
      </p>
      <output className="economy-feedback" aria-live="polite">
        {feedback}
      </output>
      <Tabs defaultValue="goals">
        <TabsList className="economy-tabs">
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
          <TabsTrigger value="region">Region</TabsTrigger>
        </TabsList>
        <TabsContent value="goals">
          {r.mode === 'sandbox' ? (
            <p>
              Explore the full collection or start a guided campaign with two
              engines. Four challenges test a different part of your railway.
            </p>
          ) : (
            <>
              <p>
                {scenario?.goal ??
                  'Complete your railway training, deliver 420 units, grow one town and research two projects.'}
              </p>
              {scenario && (
                <p>
                  {Math.max(
                    0,
                    Math.ceil((scenario.duration - sim.elapsed) / 60),
                  )}{' '}
                  minutes remaining · {scenario.hint}
                </p>
              )}
              <div className="economy-summary">
                <div>
                  <span>Delivered</span>
                  <strong>{r.delivered}</strong>
                </div>
                <div>
                  <span>Punctuality</span>
                  <strong>{Math.round(score.punctuality)}%</strong>
                  <small>{score.departures} departures</small>
                </div>
                <div>
                  <span>Growing towns</span>
                  <strong>{r.towns.filter((t) => t.level > 0).length}</strong>
                </div>
              </div>
              {r.mode === 'mountain' && (
                <p>Granite Ridge coal: {r.mountainCoal} / 126</p>
              )}
              {r.mode === 'river' && (
                <p>Delivered over new track: {r.builtDelivered} / 84</p>
              )}
              {r.mode === 'junction' && (
                <p>Traffic waits resolved after intervention: {r.resolved}</p>
              )}
              {r.mode === 'passenger' && (
                <p>Passengers delivered: {r.passengers} / 252</p>
              )}
            </>
          )}
          {r.mode === 'campaign' && (
            <ol className="region-tutorial">
              {TUTORIAL.map((step, i) => (
                <li key={step.id} data-complete={r.tutorial.includes(step.id)}>
                  <strong>
                    {r.tutorial.includes(step.id) ? '✓' : i + 1} · {step.title}
                  </strong>
                  <p>{step.text}</p>
                  {!r.tutorial.includes(step.id) && step.panel !== 'region' && (
                    <button onClick={() => navigate(step.panel)}>
                      Open{' '}
                      {step.panel === 'dispatch'
                        ? 'Dispatcher'
                        : step.panel === 'build'
                          ? 'Build & route'
                          : step.panel === 'fleet'
                            ? 'Fleet & depots'
                            : 'Economy'}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
          {r.result && (
            <div className="region-results" aria-live="polite">
              <h3>
                {r.result.outcome === 'won'
                  ? 'Railway goal achieved'
                  : 'Challenge window ended'}
              </h3>
              <p>
                {r.result.outcome === 'won'
                  ? 'Your railway can keep growing. Continue playing or try another challenge.'
                  : 'Keep operating and improve the railway, or start the challenge again. Your result stays recorded.'}
              </p>
              <dl>
                <dt>Delivered</dt>
                <dd>{r.result.delivered}</dd>
                <dt>Operating profit</dt>
                <dd>{money(r.result.profit)}</dd>
                <dt>Punctuality</dt>
                <dd>{Math.round(r.result.punctuality)}%</dd>
              </dl>
              <h4>Main bottlenecks</h4>
              {r.result.bottlenecks.length ? (
                r.result.bottlenecks.map(([kind, seconds]) => (
                  <p key={kind}>
                    {kind}: {seconds} train-seconds waiting
                  </p>
                ))
              ) : (
                <p>No recorded waits.</p>
              )}
            </div>
          )}
          {r.achievements.length > 0 && (
            <div>
              <h3>Achievements</h3>
              <ul>
                {r.achievements.map((a) => (
                  <li key={a}>{a.replaceAll('-', ' ')}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="economy-small">
            Need room to recover? Stop unused services, choose a supplied route,
            service worn engines, or borrow in Economy. There is no forced
            bankruptcy.
          </p>
          <button onClick={newSession}>
            New campaign, sandbox or challenge
          </button>
        </TabsContent>
        <TabsContent value="research">
          <p>
            {r.settings.progression
              ? 'Research unlocks purchases. Each project follows useful railway work.'
              : 'All engines and infrastructure are available. Enable progression in sandbox settings to apply research gates.'}
          </p>
          {(Object.keys(RESEARCH) as ResearchId[]).map((id) => {
            const item = RESEARCH[id],
              reason = researchReason(sim, id);
            return (
              <article className="region-research" key={id}>
                <h3>
                  {item.name} · {money(item.price)}
                </h3>
                <p>{item.description}</p>
                <button
                  disabled={!!reason}
                  onClick={() =>
                    act(() => research(sim, id), `${item.name} researched.`)
                  }
                >
                  {r.research.includes(id) ? 'Researched' : 'Research'}
                </button>
                {reason && <p className="economy-small">{reason}</p>}
              </article>
            );
          })}
        </TabsContent>
        <TabsContent value="region">
          <h3 className="region-weather">
            {sky.season} · {sky.weather}
          </h3>
          <p>
            {Math.round((1 - sky.speed) * 100)}% weather speed reduction.
            Braking protection remains active. Next forecast in{' '}
            {Math.max(0, Math.ceil(sky.nextAt - sim.elapsed))} seconds:{' '}
            {conditions(sim, sky.nextAt).weather}.
          </p>
          {event && (
            <div className="region-research">
              <h3>Bridge inspection</h3>
              <p>
                {event.edge
                  ? sim.resourceLabel(`block:${event.edge}`)
                  : 'No bridge on this map'}
              </p>
              <p>
                {event.active
                  ? `Inspection active · reopens in ${Math.ceil(event.end - sim.elapsed)} seconds.`
                  : sim.elapsed >= event.end
                    ? 'Inspection finished this cycle.'
                    : `Starts in ${Math.ceil(event.start - sim.elapsed)} seconds; lasts 120 seconds.`}{' '}
                New trains wait or use another route. Trains already crossing
                clear normally.
              </p>
              <button
                disabled={
                  !event.edge || event.deferred || sim.elapsed >= event.start
                }
                onClick={() =>
                  act(
                    () => deferInspection(sim),
                    'Inspection deferred by five minutes.',
                  )
                }
              >
                Defer five minutes · $2,500
              </button>
              <h3>Town festival</h3>
              <p>
                {
                  sim.network.nodes.find((n) => n.id === event.festivalNode)
                    ?.name
                }{' '}
                · minutes {event.festivalStart / 60}–{event.festivalEnd / 60}:
                extra passenger generation and consumer demand.
              </p>
            </div>
          )}
          <h3>Regional development</h3>
          <p>
            Deliver at least 24 units in each of two consecutive ten-minute
            windows to add a level. Towns have at most three growth levels.
            Larger towns consume more supplies and generate more passengers.
          </p>
          <div className="region-towns">
            {r.towns
              .filter((t) =>
                sim.network.stations.some((s) => s.node === t.node),
              )
              .map((t) => (
                <article key={t.node}>
                  <strong>
                    {sim.network.nodes.find((n) => n.id === t.node)?.name}
                  </strong>
                  <span>
                    Level {t.level} · {800 + t.level * 240} residents
                  </span>
                  <span>
                    {t.supplied} / 24 units this window · {t.streak} / 2
                    reliable windows
                  </span>
                  <progress max={24} value={Math.min(24, t.supplied)} />
                </article>
              ))}
          </div>
          {r.mode === 'sandbox' && (
            <>
              <h3>Sandbox rules</h3>
              {(['progression', 'growth', 'weather', 'events'] as const).map(
                (key) => (
                  <label
                    className="fleet-switch"
                    key={key}
                    htmlFor={`region-${key}`}
                  >
                    {key}
                    <Switch
                      id={`region-${key}`}
                      checked={r.settings[key]}
                      onCheckedChange={(value) =>
                        act(
                          () => setRegionSetting(sim, key, value),
                          `${key} ${value ? 'enabled' : 'disabled'}.`,
                        )
                      }
                    />
                  </label>
                ),
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
