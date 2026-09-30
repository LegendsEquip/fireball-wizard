// All sound is synthesized with Web Audio, so there are no files to load.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  // Must be called from a click (browsers block audio until then).
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Brown noise for the cave rumble
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this.startAmbience();
  }

  src(buffer, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = loop;
    return s;
  }

  env(gainNode, t, attack, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  startAmbience() {
    const ctx = this.ctx;
    const rumble = this.src(this.brown, true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.value = 0.18;
    rumble.connect(lp).connect(g).connect(this.master);
    rumble.start();
    const drip = () => {
      if (!this.ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'sine';
      const f = 900 + Math.random() * 900;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.08);
      this.env(og, t, 0.004, 0.05 + Math.random() * 0.05, 0.25);
      o.connect(og).connect(this.master);
      o.start(t);
      o.stop(t + 0.35);
      setTimeout(drip, 1500 + Math.random() * 4500);
    };
    setTimeout(drip, 2000);
  }

  cast(big) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.src(this.noise);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(big ? 300 : 600, t);
    bp.frequency.exponentialRampToValueAtTime(big ? 1400 : 2600, t + (big ? 0.5 : 0.25));
    const g = ctx.createGain();
    this.env(g, t, 0.02, big ? 0.9 : 0.45, big ? 0.6 : 0.3);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 1);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(big ? 90 : 160, t);
    o.frequency.exponentialRampToValueAtTime(big ? 45 : 80, t + 0.2);
    this.env(og, t, 0.005, big ? 0.6 : 0.3, 0.2);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
  }

  explode(big, vol = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.src(this.noise);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(big ? 2400 : 3200, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + (big ? 1.4 : 0.7));
    const g = ctx.createGain();
    this.env(g, t, 0.006, (big ? 1.4 : 0.8) * vol, big ? 1.5 : 0.75);
    n.connect(lp).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 2);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(big ? 70 : 110, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    this.env(og, t, 0.005, (big ? 1.2 : 0.6) * vol, big ? 0.8 : 0.4);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 1);
  }

  blip(type, f0, f1, dur, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, 0.005, vol, dur);
    const lp = ctx.createBiquadFilter();
    lp.frequency.value = 1800;
    o.connect(lp).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  goblinHurt() { this.blip('square', 520 + Math.random() * 120, 300, 0.12, 0.12); }
  goblinDie() { this.blip('sawtooth', 380, 90, 0.4, 0.16); }
  goblinJab() { this.blip('triangle', 700, 350, 0.08, 0.08); }
  playerHurt() { this.blip('sine', 180, 60, 0.25, 0.5); }
  wave() { this.blip('triangle', 220, 440, 0.5, 0.2); }
}
