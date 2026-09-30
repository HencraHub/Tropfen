/** All sound is synthesised here: no samples, no external files (docs/LIZENZEN.md). */
export class Synth {
  ctx: AudioContext | null = null;
  master!: GainNode; sfx!: GainNode; music!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private musicTimer = 0;
  private musicOn = false;
  private lastTick = -1;
  enabled = true;

  init(): void {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
      this.music = this.ctx.createGain(); this.music.connect(this.master);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }
  resume(): void { this.ctx?.resume(); }
  setVolumes(master: number, sfx: number, music: number): void {
    if (!this.ctx) return;
    this.master.gain.value = master; this.sfx.gain.value = sfx; this.music.gain.value = music;
  }

  private noise(duration: number, filterHz: number, q: number, gain: number, attack = 0.01, type: BiquadFilterType = 'bandpass'): void {
    if (!this.ctx || !this.noiseBuf || !this.enabled) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterHz; f.Q.value = q;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t); src.stop(t + duration + 0.05);
  }
  private tone(freq: number, duration: number, gain: number, type: OscillatorType = 'triangle', slide = 0, dest?: GainNode): void {
    if (!this.ctx || !this.enabled) return;
    const o = this.ctx.createOscillator(); o.type = type;
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g); g.connect(dest ?? this.sfx);
    o.start(t); o.stop(t + duration + 0.05);
  }

  // ---- game sounds
  pour(liters: number): void { this.noise(0.5 + Math.min(1.5, liters / 200), 900, 0.7, 0.35, 0.05, 'lowpass'); this.tone(320, 0.15, 0.05, 'sine', -120); }
  sizzle(strength: number): void { this.noise(0.8 + strength, 3800, 1.2, 0.3 * Math.min(1, strength), 0.02, 'highpass'); }
  scoop(): void { this.noise(0.3, 600, 1, 0.25, 0.02, 'lowpass'); this.tone(180, 0.2, 0.08, 'sine', 60); }
  crack(strength: number): void { this.noise(0.12, 2200, 0.5, 0.6 * Math.min(1, 0.4 + strength)); this.tone(70, 0.35, 0.4 * Math.min(1, 0.5 + strength), 'square', -40); }
  steam(): void { this.noise(1.6, 2600, 0.8, 0.5, 0.05, 'bandpass'); this.tone(900, 0.6, 0.1, 'sawtooth', -600); }
  freeze(): void { this.tone(1400, 0.4, 0.12, 'sine', 400); this.tone(2100, 0.5, 0.08, 'sine', 300); this.noise(0.4, 6000, 0.6, 0.1, 0.05, 'highpass'); }
  step(): void { this.noise(0.08, 300, 0.8, 0.12, 0.005, 'lowpass'); }
  click(): void { this.tone(880, 0.05, 0.12, 'square'); }
  confirm(): void { this.tone(660, 0.08, 0.12, 'triangle'); this.tone(990, 0.12, 0.1, 'triangle'); }
  cancel(): void { this.tone(440, 0.1, 0.1, 'triangle', -120); }
  popup(): void { for (let i = 0; i < 5; i++) setTimeout(() => this.tone(300 + i * 90, 0.08, 0.12, 'square'), i * 90); }
  coin(): void { this.tone(1320, 0.1, 0.12, 'square'); this.tone(1760, 0.15, 0.1, 'square'); }
  stamp(): void { this.noise(0.1, 500, 0.7, 0.4, 0.005, 'lowpass'); this.tone(120, 0.12, 0.25, 'square', -60); }
  drill(): void { this.tone(140, 0.25, 0.15, 'sawtooth', 30); this.noise(0.25, 1800, 2, 0.15); }
  chop(): void { this.noise(0.1, 900, 1, 0.35, 0.005, 'bandpass'); this.tone(200, 0.1, 0.2, 'square', -100); }
  stumble(): void { this.tone(260, 0.2, 0.15, 'sawtooth', -150); this.noise(0.4, 700, 0.6, 0.3, 0.02, 'lowpass'); }
  grumble(): void { const b = 90 + Math.random() * 30; this.tone(b, 0.5, 0.2, 'sawtooth', -20); this.tone(b * 1.5, 0.4, 0.08, 'triangle', -30); }
  fanfare(): void { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 0.18, 'triangle'), i * 160)); }
  bell(): void { this.tone(1046, 0.8, 0.15, 'sine', -20); this.tone(1568, 0.6, 0.06, 'sine'); }

  /** A quiet marimba loop; called every frame with the game hour. */
  updateMusic(dt: number, hour: number, on: boolean): void {
    if (!this.ctx || !this.enabled) return;
    this.musicOn = on;
    if (!on) return;
    this.musicTimer += dt;
    const beat = hour >= 20 || hour < 6 ? 0.9 : 0.6;
    if (this.musicTimer >= beat) {
      this.musicTimer -= beat;
      this.lastTick = (this.lastTick + 1) % 16;
      const scale = [0, 2, 4, 7, 9, 12, 14, 16];
      const base = hour >= 20 || hour < 6 ? 196 : 262;
      const n = scale[(this.lastTick * 5 + Math.floor(this.lastTick / 4)) % scale.length];
      if (this.lastTick % 2 === 0 || Math.random() < 0.4) this.tone(base * Math.pow(2, n / 12), 0.35, 0.05, 'sine', 0, this.music);
      if (this.lastTick % 4 === 0) this.tone(base / 2, 0.5, 0.05, 'triangle', 0, this.music);
    }
  }
}
