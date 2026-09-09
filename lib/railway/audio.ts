import * as THREE from 'three';
export type AudioMix = { master: number; effects: number; ambience: number };
export type SoundTrain = {
  position: THREE.Vector3;
  running: boolean;
  bridge: boolean;
  effort: number;
  speed: number;
};
type Voice = {
  panner: PannerNode;
  exhaust: GainNode;
  clatter: GainNode;
  bridge: GainNode;
  whistle: GainNode;
  sources: AudioScheduledSourceNode[];
  phase: number;
  running: boolean;
};

/** Local synthesis, no network media. The AudioContext is created only by Enable sound. */
export class RailwayAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private effects?: GainNode;
  private ambience?: GainNode;
  private voices: Voice[] = [];
  private ambientSource?: AudioBufferSourceNode;
  mix: AudioMix = { master: 0.55, effects: 0.7, ambience: 0.4 };
  enabled = false;
  private disposed = false;
  async enable() {
    if (this.disposed) return false;
    if (!this.context) this.create();
    await this.context!.resume();
    if (this.disposed) return false;
    this.enabled = this.context!.state === 'running';
    return this.enabled;
  }
  private create() {
    const ctx = (this.context = new AudioContext());
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.effects = ctx.createGain();
    this.effects.connect(this.master);
    this.ambience = ctx.createGain();
    this.ambience.connect(this.master);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const samples = noise.getChannelData(0);
    let seed = 917;
    for (let i = 0; i < samples.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      samples[i] = seed / 2147483648 - 1;
    }
    const ambient = (this.ambientSource = ctx.createBufferSource());
    ambient.buffer = noise;
    ambient.loop = true;
    const wind = ctx.createBiquadFilter();
    wind.type = 'lowpass';
    wind.frequency.value = 420;
    const quiet = ctx.createGain();
    quiet.gain.value = 0.055;
    ambient.connect(wind).connect(quiet).connect(this.ambience);
    ambient.start();
    for (let i = 0; i < 12; i++) {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 6;
      panner.maxDistance = 250;
      panner.rolloffFactor = 1.5;
      panner.connect(this.effects);
      const exhaust = ctx.createGain(),
        clatter = ctx.createGain(),
        bridge = ctx.createGain(),
        whistle = ctx.createGain();
      for (const gain of [exhaust, clatter, bridge, whistle]) {
        gain.gain.value = 0;
        gain.connect(panner);
      }
      const steam = ctx.createBufferSource();
      steam.buffer = noise;
      steam.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 900;
      band.Q.value = 0.6;
      steam.connect(band).connect(exhaust);
      steam.start();
      const wheels = ctx.createBufferSource();
      wheels.buffer = noise;
      wheels.loop = true;
      const high = ctx.createBiquadFilter();
      high.type = 'highpass';
      high.frequency.value = 1600;
      wheels.connect(high).connect(clatter);
      wheels.start();
      const resonance = ctx.createOscillator();
      resonance.type = 'triangle';
      resonance.frequency.value = 73 + i;
      resonance.connect(bridge);
      resonance.start();
      const horn = ctx.createOscillator();
      horn.type = 'sine';
      horn.frequency.value = 390 + i * 11;
      horn.connect(whistle);
      horn.start();
      this.voices.push({
        panner,
        exhaust,
        clatter,
        bridge,
        whistle,
        sources: [steam, wheels, resonance, horn],
        phase: 0,
        running: false,
      });
    }
  }
  update(
    camera: THREE.Camera,
    trains: SoundTrain[],
    delta: number,
    paused: boolean,
  ) {
    const ctx = this.context;
    if (!ctx || !this.enabled) return;
    const now = ctx.currentTime;
    this.master!.gain.setTargetAtTime(
      this.mix.master * (paused ? 0 : 0.55),
      now,
      0.08,
    );
    this.effects!.gain.setTargetAtTime(this.mix.effects, now, 0.08);
    this.ambience!.gain.setTargetAtTime(this.mix.ambience, now, 0.08);
    const forward = camera.getWorldDirection(new THREE.Vector3()),
      up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const listener = ctx.listener;
    listener.positionX.value = camera.position.x;
    listener.positionY.value = camera.position.y;
    listener.positionZ.value = camera.position.z;
    listener.forwardX.value = forward.x;
    listener.forwardY.value = forward.y;
    listener.forwardZ.value = forward.z;
    listener.upX.value = up.x;
    listener.upY.value = up.y;
    listener.upZ.value = up.z;
    trains.forEach((train, i) => {
      const voice = this.voices[i];
      if (!voice) return;
      voice.panner.positionX.value = train.position.x;
      voice.panner.positionY.value = train.position.y;
      voice.panner.positionZ.value = train.position.z;
      if (!paused && train.running) voice.phase += delta * train.speed * 5;
      const pulse = Math.max(0, Math.sin(voice.phase * Math.PI * 2)) ** 8;
      const running = train.running && !paused;
      voice.exhaust.gain.setTargetAtTime(
        running ? 0.045 + pulse * 0.15 * train.effort : 0,
        now,
        0.02,
      );
      voice.clatter.gain.setTargetAtTime(
        running ? pulse * 0.045 : 0,
        now,
        0.01,
      );
      voice.bridge.gain.setTargetAtTime(
        running && train.bridge ? 0.045 * pulse : 0,
        now,
        0.04,
      );
      if (running && !voice.running) this.whistle(i);
      voice.running = train.running;
    });
  }
  whistle(id: number) {
    if (!this.context || !this.enabled) return;
    const gain = this.voices[id]?.whistle.gain;
    if (!gain) return;
    const now = this.context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(0, now);
    gain.linearRampToValueAtTime(0.1, now + 0.12);
    gain.linearRampToValueAtTime(0.06, now + 0.6);
    gain.linearRampToValueAtTime(0, now + 1);
  }
  silence() {
    if (this.context)
      this.master?.gain.setValueAtTime(0, this.context.currentTime);
  }
  mute() {
    this.enabled = false;
    if (this.context) {
      this.master?.gain.setValueAtTime(0, this.context.currentTime);
      void this.context.suspend();
    }
  }
  dispose() {
    this.disposed = true;
    this.enabled = false;
    this.ambientSource?.stop();
    for (const voice of this.voices) {
      voice.sources.forEach((source) => {
        source.stop();
        source.disconnect();
      });
      voice.panner.disconnect();
    }
    void this.context?.close();
    this.voices = [];
  }
}
