'use client';
import { MAP_VIEWBOX, MAP } from '@/lib/railway/map';
import { riverX } from '@/lib/railway/terrain';
import { consistLength } from '@/lib/railway/dispatch';
/* eslint-disable next/no-img-element -- Images are generated locally from Three.js models as data URLs. */
/* eslint-disable react/react-compiler -- The compiler lint pass crashes on the imperative Three.js simulation store; this component opts out with use no memo. */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Box,
  Check,
  CircleHelp,
  Compass,
  Crosshair,
  Flag,
  Leaf,
  Maximize2,
  Minus,
  Moon,
  Camera,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sun,
  TrainFront,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { locomotives, money } from '@/lib/railway/data';
import { RegionOffice } from './region-office';
import {
  recordAction,
  SCENARIOS,
  TUTORIAL,
  conditions,
  type SessionMode,
} from '@/lib/railway/region';
import { FleetOffice } from './fleet-office';
import { ENGINES } from '@/lib/railway/fleet';
import { EconomyOffice } from './economy-office';
import { accounts, WAGONS } from '@/lib/railway/economy';
import { Dispatcher } from './dispatcher';
import { speedKmh } from '@/lib/railway/dispatch';
import { NetworkEditor } from './network-editor';
import { nodeAt } from '@/lib/railway/network';
import { Simulation } from '@/lib/railway/simulation';
import type { RailwayWorld, CameraMode } from '@/lib/railway/world';
import { makePortraits } from '@/lib/railway/portraits';
import type { AudioMix } from '@/lib/railway/audio';
import { registerRailwayTools } from '@/lib/railway/webmcp';
import { browserSaveStore } from '@/lib/railway/browser-storage';
import { SaveOffice, downloadFile } from './save-office';
export default function Game() {
  'use no memo'; // The mutable simulation is sampled by a render timer, outside React Compiler ownership.
  const [simulation] = useState(() => new Simulation());
  const mount = useRef<HTMLDivElement>(null),
    world = useRef<RailwayWorld | null>(null),
    sim = useRef(simulation);
  const [selected, setSelected] = useState(10),
    [mode, setMode] = useState<CameraMode>('iso'),
    [following, setFollowing] = useState(false),
    [labels, setLabels] = useState(true),
    [cycle, setCycle] = useState(true),
    [sound, setSound] = useState(false),
    [photo, setPhoto] = useState(false),
    [mix, setMix] = useState<AudioMix>({
      master: 0.55,
      effects: 0.7,
      ambience: 0.4,
    }),
    [speed, setSpeed] = useState(1),
    [paused, setPaused] = useState(false),
    [tick, setTick] = useState(0),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [portraits, setPortraits] = useState<string[]>([]),
    [resetOpen, setResetOpen] = useState(false),
    [rosterOpen, setRosterOpen] = useState(false),
    [detailsOpen, setDetailsOpen] = useState(false),
    [quality, setQuality] = useState('balanced'),
    [editorOpen, setEditorOpen] = useState(false),
    [dispatcherOpen, setDispatcherOpen] = useState(false),
    [economyOpen, setEconomyOpen] = useState(false),
    [fleetOpen, setFleetOpen] = useState(false),
    [regionOpen, setRegionOpen] = useState(false),
    [sessionMode, setSessionMode] = useState<SessionMode>('campaign'),
    [reducedMotion, setReducedMotion] = useState(false),
    [resetBusy, setResetBusy] = useState(false),
    [resetRecovery, setResetRecovery] = useState(true);
  const autosaveClock = useRef(0);
  const autosaveFailed = useRef(false);
  function selectTrain(id: number) {
    setSelected(id);
    if (sim.current.fleet.units[id]?.owned) recordAction(sim.current, 'select');
  }
  useEffect(() => {
    let active = true;
    let instance: RailwayWorld | undefined;
    import('@/lib/railway/world')
      .then(({ RailwayWorld }) => {
        if (!active || !mount.current) return;
        try {
          instance = new RailwayWorld(mount.current, sim.current, (id) => {
            setSelected(id);
            if (sim.current.fleet.units[id]?.owned)
              recordAction(sim.current, 'select');
            setDetailsOpen(true);
          });
          world.current = instance;
          instance.onCameraManual = () => setFollowing(false);
          instance.onContextChange = (lost) => {
            setPaused(sim.current.paused);
            setNotice(
              lost
                ? 'Graphics interrupted. Railway paused; you can still save or export it.'
                : 'Graphics restored. Release pause when you are ready.',
            );
          };
          const reduced = window.matchMedia(
            '(prefers-reduced-motion: reduce)',
          ).matches;
          let preference = reduced;
          try {
            const stored = localStorage.getItem('steam-atlas-reduced-motion');
            if (stored !== null) preference = stored === 'true';
          } catch {
            /* Device storage is optional. */
          }
          instance.setReducedMotion(preference);
          setReducedMotion(preference);
          try {
            setPortraits(makePortraits());
          } catch {
            /* Portraits are optional; keep the playable scene. */
          }
          setReady(true);
        } catch (e) {
          setError(
            e instanceof Error ? e.message : 'Unable to start the 3D scene.',
          );
        }
      })
      .catch(() => {
        if (active) setError('Unable to load the 3D engine. Please reload.');
      });
    const timer = window.setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1);
    }, 300);
    return () => {
      active = false;
      clearInterval(timer);
      instance?.dispose();
      world.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    return registerRailwayTools(
      sim.current,
      (id) => {
        setSelected(id);
        if (sim.current.fleet.units[id]?.owned)
          recordAction(sim.current, 'select');
        setFollowing(true);
        world.current?.follow(id);
      },
      () => setTick((t) => t + 1),
    );
  }, [ready]);
  useEffect(() => {
    if (world.current) {
      world.current.selected = selected;
      if (following) world.current.follow(selected);
    }
  }, [selected, following]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      try {
        if (localStorage.getItem('steam-atlas-reduced-motion') !== null) return;
      } catch {
        /* Follow the system when storage is unavailable. */
      }
      setReducedMotion(media.matches);
      world.current?.setReducedMotion(media.matches);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  function camera(next: CameraMode) {
    setMode(next);
    world.current?.setMode(next);
  }
  function overview() {
    setFollowing(false);
    setPhoto(false);
    if (world.current) world.current.photoMode = false;
    world.current?.overview();
  }
  const follow = useCallback(() => {
    if (following) {
      setFollowing(false);
      if (world.current) world.current.following = false;
    } else {
      setFollowing(true);
      world.current?.follow(selected);
    }
  }, [following, selected]);
  function photoView() {
    const enabled = !photo;
    setPhoto(enabled);
    if (world.current) world.current.photoMode = enabled;
  }
  async function toggleSound() {
    const audio = world.current?.audio;
    if (!audio) return;
    if (sound) {
      audio.mute();
      setSound(false);
      return;
    }
    try {
      audio.mix = mix;
      setSound(await audio.enable());
    } catch {
      setNotice('Sound could not start. Try Enable sound again.');
    }
  }
  function adjustMix(channel: keyof AudioMix, value: number) {
    const next = { ...mix, [channel]: value };
    setMix(next);
    if (world.current) world.current.audio.mix = next;
  }
  function pause() {
    if (world.current?.contextLost) {
      setNotice('The railway stays paused until graphics recover.');
      return;
    }
    sim.current.paused = !sim.current.paused;
    setPaused(sim.current.paused);
  }
  function restored(state: ReturnType<Simulation['save']>) {
    sim.current.restore(state);
    sim.current.paused = true;
    sim.current.speed = 1;
    setPaused(true);
    setSpeed(1);
    setSelected(
      Math.max(
        0,
        sim.current.fleet.units.findIndex((unit) => unit.owned),
      ),
    );
    setEditorOpen(false);
    setDispatcherOpen(false);
    setFleetOpen(false);
    setRegionOpen(false);
    setEconomyOpen(false);
    autosaveClock.current = 0;
    overview();
    setTick((t) => t + 1);
  }
  useEffect(() => {
    const interval = window.setInterval(async () => {
      if (
        !ready ||
        document.hidden ||
        sim.current.paused ||
        world.current?.photoMode ||
        world.current?.contextLost
      )
        return;
      autosaveClock.current += 1;
      if (autosaveClock.current < 120) return;
      autosaveClock.current = 0;
      try {
        await browserSaveStore().autosave(sim.current.save());
        autosaveFailed.current = false;
      } catch {
        if (!autosaveFailed.current)
          setNotice(
            'Autosave could not write to device storage. Use Saves → Export current railway.',
          );
        autosaveFailed.current = true;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [ready]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (
        (e.target instanceof HTMLElement &&
          (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(
            e.target.tagName,
          ) ||
            e.target.isContentEditable)) ||
        document.querySelector('[role="dialog"]')
      )
        return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        pause();
      } else if (e.key.toLowerCase() === 'i')
        camera(mode === 'iso' ? '3d' : 'iso');
      else if (e.key.toLowerCase() === 'f') follow();
      else if (e.key === 'Escape') overview();
      else if (['1', '2', '3'].includes(e.key)) {
        const s = [1, 3, 8][Number(e.key) - 1];
        sim.current.speed = s;
        setSpeed(s);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [mode, follow]);
  const engine = ENGINES[sim.current.fleet.units[selected].engine],
    train = sim.current.trains[selected],
    route = sim.current.services[selected].stops,
    [a, b] = sim.current.endpoints(train),
    running = train.status === 'Running' && !paused;
  const date = new Date(
    Date.UTC(1938, 6, 16) + sim.current.elapsed * 180000,
  ).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const active = sim.current.trains.filter(
    (t) => !t.held && sim.current.fleet.units[t.id].owned,
  ).length;
  const progress = Math.min(
    100,
    train.motion.physical.route
      ? (100 *
          Math.max(
            0,
            train.motion.physical.at - 3 - consistLength(train.cars),
          )) /
          (sim.current.topology.length(train.motion.physical.route.sections) -
            6 -
            consistLength(train.cars))
      : 0,
  );
  void tick;
  return (
    <main className={`game-shell ${photo ? 'photo-mode' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="monogram">
            SA<span>↗</span>
          </div>
          <div>
            <div className="brand-name">STEAM ATLAS</div>
            <div className="brand-subtitle">Meridian Railway Company</div>
          </div>
        </div>
        <div className="company-stats">
          <div>
            <span className="eyebrow">Treasury</span>
            <strong>{money(sim.current.treasury)}</strong>
          </div>
          <div className="profit-stat">
            <span className="eyebrow">Net operating profit</span>
            <strong>{money(accounts(sim.current.economy).profit)}</strong>
          </div>
          <div>
            <span className="eyebrow">Delivered</span>
            <strong>
              {sim.current.delivered.toLocaleString()}
              <small> units</small>
            </strong>
          </div>
        </div>
        <div className="header-end">
          <span className="sandbox-badge">
            <span className="live-dot" />{' '}
            {sim.current.economy.mode === 'unlimited'
              ? 'Unlimited funds'
              : 'Standard economy'}
          </span>
          <Dialog>
            <DialogTrigger className="icon-button" aria-label="How to play">
              <CircleHelp size={19} />
            </DialogTrigger>
            <DialogContent className="help-dialog">
              <DialogHeader>
                <DialogTitle>Welcome to Meridian Valley</DialogTitle>
                <DialogDescription>
                  Run a living miniature railway. Your twelve locomotives carry
                  passengers and freight between eight towns.
                </DialogDescription>
              </DialogHeader>
              <div className="help-content">
                <p>
                  <strong>Explore the valley.</strong> In isometric mode, drag
                  to pan. In 3D, drag to orbit and right-drag to pan. Scroll or
                  pinch to zoom.
                </p>
                <p>
                  <strong>Ride the rails.</strong> Select a locomotive from the
                  roster or click it on the map. Follow train locks the camera
                  to its journey.
                </p>
                <p>
                  <strong>Run your railway.</strong> Deliveries earn money. Add
                  wagons to carry more cargo, hold individual trains, and change
                  the simulation speed. Red signals protect occupied track.
                </p>
                <p>
                  <strong>Keep your progress.</strong> Save and Load use this
                  browser’s local storage.
                </p>
                <div className="shortcut-grid">
                  <span>
                    <kbd>Space</kbd> Pause
                  </span>
                  <span>
                    <kbd>I</kbd> Camera mode
                  </span>
                  <span>
                    <kbd>F</kbd> Follow train
                  </span>
                  <span>
                    <kbd>Esc</kbd> Map overview
                  </span>
                  <span>
                    <kbd>1–3</kbd> Simulation speed
                  </span>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      <div className="workspace">
        <aside
          className={`roster ${rosterOpen ? 'mobile-open' : ''}`}
          aria-label="Locomotive roster"
        >
          <div className="roster-heading">
            <div className="eyebrow">The collection</div>
            <h2>
              Locomotive roster <span>{locomotives.length}</span>
            </h2>
            <div className="roster-summary">
              <span>
                <i className="live-dot" /> {active} active services
              </span>
              <span>1885–1934</span>
            </div>
            <button
              className="mobile-close icon-button"
              aria-label="Close roster"
              onClick={() => setRosterOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="roster-list">
            {sim.current.fleet.units.map((unit, i) => {
              const l = ENGINES[unit.engine];
              return (
                <button
                  key={i}
                  className={`train-row ${selected === i ? 'selected' : ''}`}
                  aria-pressed={selected === i}
                  onClick={() => {
                    selectTrain(i);
                    setRosterOpen(false);
                    setDetailsOpen(true);
                  }}
                >
                  {portraits[unit.engine] ? (
                    <img src={portraits[unit.engine]} alt="" />
                  ) : (
                    <TrainFront color={l.color} size={33} />
                  )}
                  <span className="train-row-copy">
                    <strong>{unit.owned ? l.name : 'Vacant service'}</strong>
                    <small>
                      {l.type} · {l.year}
                    </small>
                  </span>
                  <i
                    className={`status-dot ${sim.current.trains[i].held ? 'held' : sim.current.trains[i].status === 'At signal' ? 'waiting' : ''}`}
                  />
                </button>
              );
            })}
          </div>
          <div className="roster-footer">
            <span>
              12 locomotives · {sim.current.network.stations.length}{' '}
              destinations
            </span>
            <small>A living collection in miniature.</small>
            <div className="collection-line">
              <span>MERIDIAN ARCHIVES</span>
              <span>VOL. 01</span>
            </div>
          </div>
        </aside>
        <section
          className="map-viewport"
          aria-label="Meridian Valley simulation"
        >
          <div ref={mount} className="world-canvas" />
          {world.current?.contextLost && (
            <div className="context-notice" role="alert">
              Graphics interrupted · railway paused. Waiting for graphics
              recovery. Saves and export remain available.
            </div>
          )}
          {!ready && !error && (
            <div className="world-loading">
              <TrainFront size={32} />
              <h2>Preparing the valley</h2>
              <p>Laying tracks and raising steam…</p>
            </div>
          )}
          {error && (
            <div className="world-loading">
              <h2>The 3D view couldn’t start</h2>
              <p>Enable hardware acceleration in your browser and reload.</p>
              <small>{error}</small>
              <button
                className="button primary"
                onClick={() => window.location.reload()}
              >
                Reload railway
              </button>
            </div>
          )}
          <div className="map-title">
            <div className="eyebrow">Region 01 / Meridian Railway</div>
            <h1>Meridian Valley</h1>
            {sim.current.region.mode !== 'sandbox' && (
              <button
                className="region-goal-link"
                onClick={() => {
                  setRegionOpen(true);
                  setFleetOpen(false);
                  setEconomyOpen(false);
                  setEditorOpen(false);
                  setDispatcherOpen(false);
                }}
              >
                {sim.current.region.result
                  ? sim.current.region.result.outcome === 'won'
                    ? 'Goal achieved · view results'
                    : 'Challenge ended · view results'
                  : sim.current.region.mode === 'campaign'
                    ? `Next: ${TUTORIAL.find((t) => !sim.current.region.tutorial.includes(t.id))?.title ?? 'Develop the valley'}`
                    : SCENARIOS[
                        sim.current.region.mode as keyof typeof SCENARIOS
                      ].name}{' '}
                · {conditions(sim.current).weather}
              </button>
            )}
            <div>
              {sim.current.network.stations.length} stations <span>·</span>{' '}
              {sim.current.network.edges.length} tracks <span>·</span> Est. 1885
            </div>
          </div>
          <div className="map-toolbar">
            <div className="toolbar-row">
              <button
                className="map-button"
                aria-expanded={regionOpen}
                onClick={() => {
                  setRegionOpen(!regionOpen);
                  setFleetOpen(false);
                  setEconomyOpen(false);
                  setEditorOpen(false);
                  setDispatcherOpen(false);
                }}
              >
                Region & goals
              </button>
              <button
                className="map-button"
                aria-expanded={editorOpen}
                onClick={() => {
                  setFleetOpen(false);
                  setRegionOpen(false);
                  setEconomyOpen(false);
                  setEditorOpen(!editorOpen);
                  setDispatcherOpen(false);
                }}
              >
                Build & route
              </button>
              <button
                className="map-button"
                aria-expanded={dispatcherOpen}
                onClick={() => {
                  setFleetOpen(false);
                  setRegionOpen(false);
                  setEconomyOpen(false);
                  setDispatcherOpen(!dispatcherOpen);
                  setEditorOpen(false);
                }}
              >
                Dispatcher
              </button>
              <button
                className="map-button"
                aria-expanded={economyOpen}
                onClick={() => {
                  setFleetOpen(false);
                  setRegionOpen(false);
                  setEconomyOpen(!economyOpen);
                  setEditorOpen(false);
                  setDispatcherOpen(false);
                }}
              >
                Economy
              </button>
              <button
                className="map-button"
                aria-expanded={fleetOpen}
                onClick={() => {
                  setRegionOpen(false);
                  setFleetOpen(!fleetOpen);
                  setEconomyOpen(false);
                  setEditorOpen(false);
                  setDispatcherOpen(false);
                }}
              >
                Fleet & depots
              </button>
            </div>
            <div className="toolbar-row">
              <button
                className="map-button"
                onClick={overview}
                title="Reset camera (Esc)"
              >
                <Crosshair size={14} /> <span>Map overview</span>
              </button>
              <button
                className={`map-button label-button ${labels ? 'enabled' : ''}`}
                aria-label="Toggle city labels"
                aria-pressed={labels}
                onClick={() => {
                  setLabels(!labels);
                  if (world.current) world.current.labelsVisible = !labels;
                }}
              >
                Aa
              </button>
            </div>
            <div className="toolbar-row">
              <div className="camera-switch" aria-label="Camera mode">
                <button
                  className={mode === '3d' ? 'active' : ''}
                  aria-pressed={mode === '3d'}
                  onClick={() => camera('3d')}
                >
                  <Box size={13} />
                  3D
                </button>
                <button
                  className={mode === 'iso' ? 'active' : ''}
                  aria-pressed={mode === 'iso'}
                  onClick={() => camera('iso')}
                >
                  Iso
                </button>
              </div>
            </div>
            <div className="toolbar-row">
              <Dialog>
                <DialogTrigger
                  className="map-button time-of-day"
                  disabled={!ready}
                >
                  {(world.current?.atmosphere.hour ?? 15) >= 20 ||
                  (world.current?.atmosphere.hour ?? 15) < 6 ? (
                    <Moon size={13} />
                  ) : (
                    <Sun size={13} />
                  )}
                  Atmosphere
                </DialogTrigger>
                <DialogContent className="atmosphere-dialog">
                  <DialogHeader>
                    <DialogTitle>Life in the valley</DialogTitle>
                    <DialogDescription>
                      Set the light, listen to the railway, or let the day
                      unfold.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="atmosphere-settings">
                    <label className="setting-toggle">
                      <input
                        type="checkbox"
                        checked={reducedMotion}
                        onChange={(e) => {
                          const value = e.target.checked;
                          setReducedMotion(value);
                          world.current?.setReducedMotion(value);
                          try {
                            localStorage.setItem(
                              'steam-atlas-reduced-motion',
                              String(value),
                            );
                          } catch {
                            /* Session preference still works. */
                          }
                        }}
                      />
                      Reduce decorative motion
                    </label>
                    <p className="setting-note">
                      Stops smoke, rain/snow animation, carriage sway and
                      animated camera transitions. Train movement and weather
                      rules continue.
                    </p>
                    <details>
                      <summary>Performance report</summary>
                      <p className="setting-note">
                        Recent frame intervals include display scheduling. CPU
                        time measures simulation and render submission, not GPU
                        execution.
                      </p>
                      <pre className="performance-report">
                        {JSON.stringify(world.current?.diagnostics, null, 2)}
                      </pre>
                      <div className="save-row-actions">
                        <button
                          className="button"
                          onClick={() => world.current?.metrics.reset()}
                        >
                          Start fresh sample
                        </button>
                        <button
                          className="button"
                          onClick={() =>
                            downloadFile(
                              JSON.stringify(
                                {
                                  date: new Date().toISOString(),
                                  browser: navigator.userAgent,
                                  viewport: [
                                    window.innerWidth,
                                    window.innerHeight,
                                  ],
                                  pixelRatio: window.devicePixelRatio,
                                  simulationSeconds: sim.current.elapsed,
                                  trains: sim.current.trains.length,
                                  diagnostics: world.current?.diagnostics,
                                },
                                null,
                                2,
                              ),
                              'steam-atlas-performance.json',
                            )
                          }
                        >
                          Export report
                        </button>
                      </div>
                    </details>
                    <div className="setting-heading">
                      <strong>Time of day</strong>
                      <output>
                        {String(
                          Math.floor(world.current?.atmosphere.hour ?? 15),
                        ).padStart(2, '0')}
                        :
                        {String(
                          Math.floor(
                            ((world.current?.atmosphere.hour ?? 15) % 1) * 60,
                          ),
                        ).padStart(2, '0')}
                      </output>
                    </div>
                    <input
                      aria-label="Time of day"
                      type="range"
                      min="0"
                      max="23.99"
                      step="0.05"
                      value={world.current?.atmosphere.hour ?? 15}
                      onChange={(e) =>
                        world.current?.setTime(Number(e.target.value))
                      }
                    />
                    <div className="light-presets">
                      {[
                        ['Afternoon', 15],
                        ['Sunset', 18.5],
                        ['Night', 23],
                      ].map(([label, hour]) => (
                        <button
                          className="button"
                          key={label}
                          onClick={() => world.current?.setTime(Number(hour))}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="setting-toggle">
                      <input
                        type="checkbox"
                        checked={cycle}
                        onChange={(e) => {
                          setCycle(e.target.checked);
                          if (world.current)
                            world.current.atmosphere.cycling = e.target.checked;
                        }}
                      />
                      Continuous day / night cycle
                    </label>
                    <p className="setting-note">
                      One day takes 12 minutes at 1×. Pausing also freezes
                      water, smoke, and daylight.
                    </p>
                    <div className="setting-heading">
                      <strong>Railway sound</strong>
                      <button
                        className="button"
                        onClick={() => void toggleSound()}
                      >
                        {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}{' '}
                        {sound ? 'Mute sound' : 'Enable sound'}
                      </button>
                    </div>
                    {(['master', 'effects', 'ambience'] as const).map(
                      (channel) => (
                        <label className="audio-setting" key={channel}>
                          <span>
                            {channel === 'master'
                              ? 'Master volume'
                              : channel === 'effects'
                                ? 'Trains & whistles'
                                : 'Wind & river'}
                            <output>{Math.round(mix[channel] * 100)}%</output>
                          </span>
                          <input
                            aria-label={channel + ' volume'}
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={mix[channel]}
                            onChange={(e) =>
                              adjustMix(channel, Number(e.target.value))
                            }
                          />
                        </label>
                      ),
                    )}
                    <button
                      className="button"
                      disabled={!sound || paused || photo}
                      onClick={() => world.current?.audio.whistle(selected)}
                    >
                      Sound {engine.name}’s whistle
                    </button>
                    <p className="setting-note">
                      Sound follows the camera. Move closer to hear wheel
                      clatter, steam exhaust, and the rumble of a bridge
                      crossing.
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="toolbar-row scenic-cameras">
              <button
                className="map-button"
                disabled={!ready}
                onClick={() => {
                  if (world.current?.setTrackside()) {
                    setFollowing(false);
                    setMode('3d');
                  } else
                    setNotice(
                      'This train is in the depot queue. Use Follow when dispatched to watch it when it appears.',
                    );
                }}
              >
                Trackside
              </button>
              <button
                className="map-button"
                disabled={!ready}
                onClick={photoView}
              >
                <Camera size={13} /> Photo
              </button>
            </div>
            <div className="toolbar-row quality-control">
              <NativeSelect
                aria-label="Visual quality"
                value={quality}
                onChange={(e) => {
                  setQuality(e.target.value);
                  world.current?.setQuality(e.target.value);
                }}
              >
                <NativeSelectOption value="balanced">
                  Balanced visuals
                </NativeSelectOption>
                <NativeSelectOption value="high">
                  High detail
                </NativeSelectOption>
                <NativeSelectOption value="low">Performance</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
          {photo && (
            <div className="photo-controls">
              <span>Photo mode · railway frozen</span>
              <button
                className="button"
                onClick={() => world.current?.capturePhoto()}
              >
                <Camera size={14} /> Save image
              </button>
              <button className="button" onClick={photoView}>
                Exit photo
              </button>
            </div>
          )}
          {following && (
            <div className="follow-banner">
              <span className="live-dot" />{' '}
              {sim.current.visible(train)
                ? `Following ${engine.name}`
                : `Waiting for dispatch · ${engine.name}`}
              <button aria-label="Stop following" onClick={follow}>
                <X size={14} />
              </button>
            </div>
          )}
          <div className="map-bottom-left">
            <div className="world-performance">
              <span className="live-dot" />{' '}
              {ready ? Math.round(world.current?.fps || 60) : '—'} FPS{' '}
              <span>·</span>{' '}
              {String(
                Math.floor(world.current?.atmosphere.hour ?? 15),
              ).padStart(2, '0')}
              :00 {paused ? 'PAUSED' : 'IN THE VALLEY'}
            </div>
            <div className="map-coordinate">
              <Compass size={15} /> MERIDIAN VALLEY <span>38° N · 106° W</span>
            </div>
            <div className="map-hint">
              {mode === 'iso'
                ? 'Drag to pan'
                : 'Drag to orbit · Right-drag to pan'}{' '}
              · Scroll to zoom · <kbd>I</kbd> camera mode
            </div>
          </div>
          <div className="map-bottom-right">
            <div className="zoom-controls">
              <button
                aria-label="Zoom in"
                onClick={() => world.current?.zoom(1)}
              >
                <Plus size={16} />
              </button>
              <button
                aria-label="Zoom out"
                onClick={() => world.current?.zoom(-1)}
              >
                <Minus size={16} />
              </button>
              <button aria-label="Fit map" onClick={overview}>
                <Maximize2 size={14} />
              </button>
            </div>
            <button
              className="minimap"
              aria-label="Return to map overview"
              onClick={overview}
            >
              <span>N ↑</span>
              <svg viewBox={MAP_VIEWBOX} aria-label="Railway network overview">
                <title>Railway network overview</title>
                <path
                  d={Array.from({ length: 121 }, (_, i) => {
                    const z = -MAP.halfDepth + (i * MAP.halfDepth) / 60;
                    return `${i ? 'L' : 'M'} ${riverX(z)} ${z}`;
                  }).join(' ')}
                  fill="none"
                  stroke="#86b6ad"
                  strokeWidth="7"
                  opacity=".55"
                />
                {sim.current.network.edges.map((edge) => (
                  <polyline
                    key={edge.id}
                    points={edge.points.map((p) => `${p.x},${p.z}`).join(' ')}
                    fill="none"
                    stroke={edge.built ? '#397758' : '#89917a'}
                    strokeWidth=".7"
                  />
                ))}
                {sim.current.network.nodes.map((c) => (
                  <circle
                    key={c.id}
                    cx={c.x}
                    cy={c.z}
                    r={c.id === a ? 3.5 : 2}
                    fill={c.id === a ? '#395e47' : '#a09978'}
                  />
                ))}
              </svg>
              <span className="minimap-title">NETWORK OVERVIEW</span>
            </button>
          </div>
          {regionOpen && (
            <RegionOffice
              sim={sim.current}
              close={() => setRegionOpen(false)}
              changed={() => setTick((t) => t + 1)}
              newSession={() => setResetOpen(true)}
              navigate={(panel) => {
                setRegionOpen(false);
                setFleetOpen(panel === 'fleet');
                setEconomyOpen(panel === 'economy');
                setEditorOpen(panel === 'build');
                setDispatcherOpen(panel === 'dispatch');
              }}
            />
          )}
          {fleetOpen && (
            <FleetOffice
              key={selected}
              sim={sim.current}
              selected={selected}
              select={selectTrain}
              close={() => setFleetOpen(false)}
              changed={() => setTick((t) => t + 1)}
            />
          )}
          {economyOpen && (
            <EconomyOffice
              sim={sim.current}
              selected={selected}
              select={selectTrain}
              close={() => setEconomyOpen(false)}
              changed={() => setTick((t) => t + 1)}
            />
          )}
          {dispatcherOpen && (
            <Dispatcher
              key={selected}
              sim={sim.current}
              selected={selected}
              select={selectTrain}
              close={() => setDispatcherOpen(false)}
              changed={() => setTick((t) => t + 1)}
            />
          )}
          {editorOpen && (
            <NetworkEditor
              sim={sim.current}
              world={world.current}
              selected={selected}
              tick={tick}
              close={() => setEditorOpen(false)}
              changed={() => setTick((t) => t + 1)}
            />
          )}
          <div className="mobile-actions">
            <button onClick={() => setRosterOpen(true)}>
              <TrainFront size={17} /> Fleet
            </button>
            <button onClick={() => setDetailsOpen(!detailsOpen)}>
              <Flag size={17} /> {engine.name}
            </button>
          </div>
        </section>
        <aside
          className={`inspector ${detailsOpen ? 'mobile-open' : ''}`}
          aria-label="Selected locomotive"
        >
          <div className="inspector-top">
            <span className="eyebrow">Selected locomotive</span>
            <span>No. {472 + selected}</span>
            <button
              className="mobile-close icon-button"
              aria-label="Close train details"
              onClick={() => setDetailsOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="locomotive-portrait">
            {portraits[selected] && (
              <img
                src={portraits[selected]}
                alt={`${engine.name} steam locomotive`}
              />
            )}
            <div className="portrait-baseline" />
          </div>
          <div className="engine-spec">
            <span>
              {engine.type} · {engine.year}
            </span>
            <span className="tiny-badge">STEAM</span>
          </div>
          <h2 className="engine-name">{engine.name}</h2>
          <p className="engine-subtitle">
            {selected === 10
              ? 'Mountain express'
              : WAGONS[sim.current.economy.services[selected].wagon].label}{' '}
            <span>·</span> Meridian collection
          </p>
          <div className="train-actions">
            <button
              className={`button primary ${following ? 'is-following' : ''}`}
              onClick={follow}
            >
              {following
                ? sim.current.visible(train)
                  ? 'Following train'
                  : 'Waiting for dispatch'
                : sim.current.visible(train)
                  ? 'Follow train'
                  : 'Follow when dispatched'}{' '}
              <ArrowUpRight size={15} />
            </button>
            <button
              className="button"
              onClick={() => {
                if (!sim.current.fleet.units[selected].owned) {
                  setNotice('Purchase a locomotive in Fleet & depots first.');
                  return;
                }
                sim.current.setHold(selected, !train.held);
                setTick((t) => t + 1);
              }}
            >
              {train.held ? 'Release' : 'Hold'}
            </button>
          </div>
          <div className="engine-metrics">
            <div>
              <span className="eyebrow">Running speed</span>
              <strong>
                {paused ? 0 : Math.round(speedKmh(train.motion.velocity))}
                <small> km/h</small>
              </strong>
            </div>
            <div>
              <span className="eyebrow">Load factor</span>
              <strong>
                {Math.round(train.load)}
                <small> %</small>
              </strong>
            </div>
          </div>
          {train.motion.wait && (
            <output className="train-wait-reason">
              {train.motion.wait.message}
            </output>
          )}
          <section className="route-section">
            <div className="section-label">
              <h3>Scheduled route</h3>
              <span className={running ? 'running-text' : ''}>
                {paused
                  ? 'Paused'
                  : train.motion.physical.queued
                    ? 'In depot queue'
                    : train.held
                      ? 'On hold'
                      : train.status}
              </span>
            </div>
            <div className="route-stops">
              {route.map((id) => (
                <div className={id === a ? 'current' : ''} key={id}>
                  <i />
                  <span>{nodeAt(sim.current.network, id).name}</span>
                </div>
              ))}
            </div>
            <div className="route-progress">
              <span style={{ width: `${progress}%` }} />
            </div>
            <p>
              Next: {nodeAt(sim.current.network, b).name} <span>·</span>{' '}
              {nodeAt(sim.current.network, b).cargo}
            </p>
          </section>
          <section className="consist-section">
            <div className="section-label">
              <h3>Consist</h3>
              <span>1 tender + {train.cars} cars</span>
            </div>
            <div className="carriage-list">
              <div>
                <TrainFront size={24} color={engine.color} />
                <span>Tender</span>
              </div>
              {Array.from({ length: train.cars }, (_, i) => (
                <div key={i}>
                  <Box size={23} color={i % 2 ? '#a56e4b' : '#7a8165'} />
                  <span>{i % 2 ? 'Goods' : 'Coach'}</span>
                </div>
              ))}
            </div>
            <button
              className="add-car"
              disabled={
                train.cars >= 6 ||
                !sim.current.canAfford(8500) ||
                train.motion.started ||
                train.motion.reversed
              }
              onClick={() => {
                if (sim.current.addCar(selected)) {
                  setTick((t) => t + 1);
                  setNotice(
                    `Wagon added to ${engine.name}. Capacity increased.`,
                  );
                } else
                  setNotice(
                    'The longer consist needs a clear approach. Wait at a station before adding a wagon.',
                  );
              }}
            >
              <span>
                <Plus size={14} />{' '}
                {train.cars >= 6
                  ? 'Maximum consist'
                  : train.motion.started || train.motion.reversed
                    ? 'Stop forward at a station to add wagons'
                    : 'Add passenger wagon'}
              </span>
              <strong>+ $8,500</strong>
            </button>
          </section>
          <details className="engine-details">
            <summary>Locomotive details</summary>
            <dl>
              <div>
                <dt>Builder</dt>
                <dd>Meridian Locomotive Works</dd>
              </div>
              <div>
                <dt>Top speed</dt>
                <dd>{engine.speed * 5} km/h</dd>
              </div>
              <div>
                <dt>Track gauge</dt>
                <dd>1,435 mm</dd>
              </div>
              <div>
                <dt>Traffic control</dt>
                <dd>Blocks, turnouts & platforms</dd>
              </div>
            </dl>
          </details>
          <div className="service-total">
            <span className="eyebrow">This service</span>
            <strong>{money(train.revenue)}</strong>
            <small>{train.delivered.toLocaleString()} units</small>
          </div>
          <div className="inspector-bottom">
            <Leaf size={14} />
            <span>The journey is the destination.</span>
          </div>
        </aside>
      </div>
      <footer className="dispatch-bar">
        <div className="operating-date">
          <span className="eyebrow">Operating day</span>
          <strong>{date}</strong>
        </div>
        <div className="playback">
          <button
            className={paused ? 'paused' : ''}
            onClick={pause}
            aria-label={paused ? 'Resume simulation' : 'Pause simulation'}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          {[1, 3, 8].map((s) => (
            <button
              key={s}
              aria-pressed={speed === s}
              className={speed === s ? 'active' : ''}
              onClick={() => {
                setSpeed(s);
                sim.current.speed = s;
              }}
            >
              {s}×
            </button>
          ))}
        </div>
        <div className="dispatch-wire">
          <i className="live-dot" />
          <div>
            <span className="eyebrow">Dispatch wire</span>
            <p>{sim.current.events[0]}</p>
          </div>
        </div>
        <div className="save-actions">
          <SaveOffice
            simulation={sim.current}
            restore={restored}
            notify={setNotice}
          />
          <Dialog
            open={resetOpen}
            onOpenChange={(value) => {
              if (!resetBusy) {
                setResetOpen(value);
                setResetRecovery(true);
              }
            }}
          >
            <DialogTrigger className="button" aria-label="Start a new railway">
              <RotateCcw size={13} />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start a new railway?</DialogTitle>
                <DialogDescription>
                  This resets the current simulation. Your manual saves remain
                  available in Saves, and a recovery copy of this railway is
                  kept.
                </DialogDescription>
              </DialogHeader>
              <label htmlFor="new-session-mode">Railway mode</label>
              <NativeSelect
                id="new-session-mode"
                value={sessionMode}
                onChange={(e) => setSessionMode(e.target.value as SessionMode)}
              >
                <NativeSelectOption value="campaign">
                  Guided campaign · two engines
                </NativeSelectOption>
                <NativeSelectOption value="sandbox">
                  Sandbox · full collection
                </NativeSelectOption>
                {Object.entries(SCENARIOS).map(([id, scenario]) => (
                  <NativeSelectOption key={id} value={id}>
                    {scenario.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p>
                {sessionMode === 'campaign'
                  ? 'Start with $145,000 and two stationary freight services. Build, route and release them to support regional growth.'
                  : sessionMode === 'sandbox'
                    ? 'All twelve engines, $425,000 and customizable regional rules.'
                    : SCENARIOS[sessionMode].goal}
              </p>
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  checked={resetRecovery}
                  disabled={resetBusy}
                  onChange={(e) => setResetRecovery(e.target.checked)}
                />
                Keep a recovery copy of this railway
              </label>
              {!resetRecovery && (
                <p>
                  Unsaved progress will be replaced. Use Saves → Export current
                  railway first to keep it.
                </p>
              )}
              <div className="reset-actions">
                <button
                  className="button"
                  disabled={resetBusy}
                  onClick={() => setResetOpen(false)}
                >
                  Keep playing
                </button>
                <button
                  className="button primary"
                  disabled={resetBusy}
                  onClick={async () => {
                    setResetBusy(true);
                    const wasPaused = sim.current.paused;
                    sim.current.paused = true;
                    try {
                      if (resetRecovery)
                        await browserSaveStore().write(
                          'recovery',
                          sim.current.save(),
                          'Before last load / new railway',
                        );
                    } catch {
                      sim.current.paused = wasPaused;
                      setResetBusy(false);
                      setNotice(
                        'Could not make a recovery copy. Export in Saves, then turn off recovery to start a new railway.',
                      );
                      return;
                    }
                    autosaveClock.current = 0;
                    setEditorOpen(false);
                    setDispatcherOpen(false);
                    setFleetOpen(false);
                    setRegionOpen(false);
                    setEconomyOpen(false);
                    const fresh = new Simulation(sessionMode);
                    sim.current.restore(fresh.save());
                    setSelected(fresh.fleet.units.findIndex((u) => u.owned));
                    setRegionOpen(sessionMode !== 'sandbox');
                    sim.current.paused = false;
                    sim.current.speed = 1;
                    setPaused(false);
                    setSpeed(1);
                    overview();
                    setResetOpen(false);
                    setResetBusy(false);
                    setNotice('A new operating day begins.');
                  }}
                >
                  New railway
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </footer>
      {notice && (
        <output className="notification" aria-live="polite">
          <Check size={16} />
          {notice}
        </output>
      )}
    </main>
  );
}
