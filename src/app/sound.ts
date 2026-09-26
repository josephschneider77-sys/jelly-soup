import type { PerspectiveCamera } from 'three/webgpu';

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class JellySound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private resumePromise: Promise<void> | null = null;
  private outputPrimed = false;
  private listener = { x: 0, y: .12, z: .19, rightX: 1, rightZ: 0 };
  private abort = new AbortController();
  muted = false;
  constructor() {
    const signal = this.abort.signal;
    window.addEventListener('pointerdown', this.unlockFromGesture, { signal });
    window.addEventListener('touchstart', this.unlockFromGesture, { passive: true, signal });
    window.addEventListener('keydown', this.unlockFromGesture, { signal });
  }
  private unlockFromGesture = () => { void this.unlock().catch(() => {}); };
  private createContext() {
    const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Context) return null;
    let context: AudioContext | null = null;
    try {
      context = new Context();
      const master = context.createGain(); master.gain.value = this.muted ? 0 : .28;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -22; compressor.knee.value = 18; compressor.ratio.value = 3;
      compressor.attack.value = .03; compressor.release.value = .28;
      master.connect(compressor).connect(context.destination);
      this.context = context; this.master = master; this.compressor = compressor;
      return context;
    } catch {
      if (context && context.state !== 'closed') void context.close().catch(() => {});
      return null;
    }
  }
  private primeOutput(context: AudioContext) {
    if (this.outputPrimed) return;
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, context.sampleRate); source.connect(context.destination); source.start();
    source.onended = () => source.disconnect(); this.outputPrimed = true;
  }
  unlock() {
    const context = this.context ?? this.createContext();
    if (!context || context.state === 'closed') return Promise.resolve();
    this.primeOutput(context);
    if (context.state === 'running') return Promise.resolve();
    if (this.resumePromise) return this.resumePromise;
    try {
      this.resumePromise = context.resume().catch(() => {}).finally(() => { this.resumePromise = null; });
    } catch { this.resumePromise = null; return Promise.resolve(); }
    return this.resumePromise;
  }
  toggle() {
    this.muted = !this.muted;
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : .28, this.context.currentTime, .04);
    return this.muted;
  }
  listen(camera: PerspectiveCamera) {
    const { x, y, z } = camera.position, e = camera.matrixWorld.elements, l = this.listener;
    l.x = x; l.y = y; l.z = z; l.rightX = e[0]; l.rightZ = e[2];
  }
  /** A short, quiet happy tone. The jelly giggles with this. */
  chirp() {
    void this.unlock().then(() => this.playChirp()).catch(() => {});
  }
  private playChirp() {
    const ctx = this.context, out = this.master;
    if (!ctx || !out || ctx.state === 'closed' || this.muted) return;
    const t = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(392, t);
    osc.frequency.exponentialRampToValueAtTime(588, t + .16);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(.07, t + .045);
    gain.gain.exponentialRampToValueAtTime(.0001, t + .32);
    osc.connect(gain).connect(out); osc.start(t); osc.stop(t + .34);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  splash() { this.tone(150, .22, .05, 'triangle'); this.noise(.09, 520, .04); }
  squeak() { this.tone(720, .09, .045, 'sine', 980); }
  pop() { this.tone(540, .07, .04, 'sine', 220); this.noise(.045, 1400, .03); }
  private tone(freq: number, dur: number, level: number, type: OscillatorType, end = freq * .8) {
    const ctx = this.context, out = this.master;
    if (!ctx || !out || ctx.state === 'closed' || this.muted) return;
    const t = ctx.currentTime, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, end), t + dur);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, t + dur);
    osc.connect(gain).connect(out); osc.start(t); osc.stop(t + dur + .02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  private noise(dur: number, cutoff: number, level: number) {
    const ctx = this.context, out = this.master;
    if (!ctx || !out || ctx.state === 'closed' || this.muted) return;
    const t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * dur * .45));
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff;
    gain.gain.value = level; source.connect(filter).connect(gain).connect(out); source.start(t);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  contact(speed: number, foot: boolean) {
    const ctx = this.context, out = this.master;
    if (!ctx || !out || ctx.state === 'closed' || this.muted) return;
    const t = ctx.currentTime, landing = !foot, strength = Math.min(1, speed / (landing ? .62 : .8)), impactBoost = landing ? 1.05 : 1;
    const base = (foot ? 170 : 118) + Math.random() * 12;
    for (const [ratio, level, decay] of [[1, .16, .22], [1.5, .06, .14], [2.2, .02, .08]] as const) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(base * ratio * (1 + strength * .35), t);
      osc.frequency.exponentialRampToValueAtTime(base * ratio * .82, t + .12);
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(level * impactBoost * (.1 + strength * .6), t + .028);
      gain.gain.exponentialRampToValueAtTime(.0001, t + decay * (1 + strength));
      osc.connect(gain).connect(out); osc.start(t); osc.stop(t + .4);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  }
  dispose() {
    this.abort.abort(); this.master?.disconnect(); this.compressor?.disconnect();
    const context = this.context; this.context = null; this.master = null; this.compressor = null; this.resumePromise = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }
}
