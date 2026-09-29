// WebAudio 절차적 사운드: 챕터별 생성형 음악 + 효과음 (음원 파일 0개)
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const SONGS = {
  title: { bar: 4.2, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55, 59], [55, 59, 62]], scale: [69, 72, 74, 76, 79, 81], density: 0.28, wave: 'triangle' },
  1: { bar: 4.0, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], scale: [69, 71, 72, 76, 79, 81], density: 0.32, wave: 'triangle' },
  2: { bar: 3.2, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60, 64], [55, 59, 62, 65]], scale: [72, 74, 76, 79, 81, 84], density: 0.55, wave: 'sine' },
  3: { bar: 3.6, chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], scale: [69, 72, 74, 76, 77, 81], density: 0.42, wave: 'triangle' },
  4: { bar: 4.6, chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]], scale: [62, 65, 67, 69, 72, 74], density: 0.2, wave: 'sine' },
  5: { bar: 3.4, chords: [[50, 54, 57, 62], [45, 49, 52, 57], [47, 50, 54, 59], [43, 47, 50, 55]], scale: [69, 71, 74, 76, 78, 81], density: 0.45, wave: 'triangle' },
  end: { bar: 3.2, chords: [[48, 52, 55, 60], [43, 47, 50, 55], [45, 48, 52, 57], [41, 45, 48, 53]], scale: [72, 74, 76, 79, 81, 84], density: 0.5, wave: 'sine' },
};

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('iwbys_mute') === '1';
    this.song = 'title';
    this.bar = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3.5;
    this.master.connect(comp); comp.connect(ctx.destination);

    this.music = ctx.createGain(); this.music.gain.value = 0.3;
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.85;
    this.rev = ctx.createConvolver(); this.rev.buffer = this.impulse(3.0, 2.4);
    const revOut = ctx.createGain(); revOut.gain.value = 0.55;
    this.rev.connect(revOut); revOut.connect(this.master);
    this.music.connect(this.master); this.sfx.connect(this.master);
    const ms = ctx.createGain(); ms.gain.value = 0.7; this.music.connect(ms); ms.connect(this.rev);
    const ss = ctx.createGain(); ss.gain.value = 0.25; this.sfx.connect(ss); ss.connect(this.rev);

    this.noise = this.makeNoise(2.5);
    this.burnLoop = this.loop('highpass', 2600, 0.8);
    this.rainLoop = this.loop('bandpass', 1400, 0.6);
    this.seaLoop = this.loop('lowpass', 420, 0.5);
    this.beepT = 0;

    this.nextBar = ctx.currentTime + 0.3;
    this.timer = setInterval(() => this.schedule(), 150);
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('iwbys_mute', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }

  impulse(dur, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }
  makeNoise(dur) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  loop(type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.sfx); src.start();
    return { g, f };
  }
  setLoop(name, v, t = 0.15) {
    if (!this.ctx) return;
    const L = this[name + 'Loop'];
    if (L) L.g.gain.setTargetAtTime(v, this.ctx.currentTime, t);
  }

  setSong(name) {
    if (this.song === name) return;
    this.song = name;
    this.bar = 0;
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const S = SONGS[this.song] || SONGS[1];
    while (this.nextBar < ctx.currentTime + 1.2) {
      this.playBar(S, this.nextBar);
      this.nextBar += S.bar;
      this.bar++;
    }
  }

  playBar(S, t) {
    const ctx = this.ctx;
    const chord = S.chords[this.bar % S.chords.length];
    const len = S.bar;
    // pad
    for (const n of chord) {
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator(); o.type = S.wave; o.frequency.value = mtof(n); o.detune.value = det;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.032, t + len * 0.35);
        g.gain.linearRampToValueAtTime(0.024, t + len * 0.9);
        g.gain.linearRampToValueAtTime(0, t + len + 1.4);
        o.connect(f); f.connect(g); g.connect(this.music);
        o.start(t); o.stop(t + len + 1.5);
      }
    }
    // bass
    const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = mtof(chord[0] - 12);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(0.1, t + 0.3); bg.gain.exponentialRampToValueAtTime(0.001, t + len);
    b.connect(bg); bg.connect(this.music); b.start(t); b.stop(t + len + 0.1);
    // music-box melody
    const steps = 8, step = len / steps;
    for (let i = 0; i < steps; i++) {
      if (Math.random() > S.density) continue;
      let n = S.scale[Math.floor(Math.random() * S.scale.length)];
      if (i === 0) n = chord[chord.length - 1] + 12;
      this.bell(t + i * step + Math.random() * 0.03, mtof(n), 0.05 + Math.random() * 0.03, this.music);
    }
  }

  bell(t, freq, vol, dest, dur = 1.6) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2.01;
    const g = ctx.createGain(), g2 = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(vol * 0.3, t + 0.005); g2.gain.exponentialRampToValueAtTime(0.0005, t + dur * 0.5);
    o.connect(g); o2.connect(g2); g.connect(dest); g2.connect(dest);
    o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }

  tone(freq, dur, vol, type = 'sine', slide = 0, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  burst(dur, vol, type, freq, q = 1, slideTo = 0, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'step': this.burst(0.06, 0.05, 'bandpass', 900 + Math.random() * 400, 2); break;
      case 'dash': this.burst(0.28, 0.22, 'bandpass', 600, 1.5, 3200); this.tone(300, 0.2, 0.05, 'sine', 2.4); break;
      case 'push': this.burst(0.18, 0.25, 'lowpass', 500, 1); this.tone(90, 0.18, 0.15, 'sine', 0.6); break;
      case 'fill': this.tone(160, 0.4, 0.2, 'sine', 0.4); this.burst(0.35, 0.2, 'lowpass', 700, 1, 150); break;
      case 'plateOn': this.tone(520, 0.25, 0.08, 'triangle'); this.tone(780, 0.35, 0.06, 'sine', 1, 0.06); break;
      case 'plateOff': this.tone(480, 0.2, 0.05, 'triangle', 0.8); break;
      case 'latch': [659, 784, 988].forEach((f, i) => this.bell(t + i * 0.08, f, 0.07, this.sfx, 1.2)); break;
      case 'door': this.burst(0.9, 0.18, 'lowpass', 300, 1, 90); this.tone(70, 0.8, 0.12, 'sine', 0.7); break;
      case 'bloom': [784, 988, 1175, 1568].forEach((f, i) => this.bell(t + i * 0.07, f, 0.06, this.sfx, 1.4)); break;
      case 'memory': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.bell(t + i * 0.09, f, 0.07, this.sfx, 2.2)); break;
      case 'dissolve': this.tone(700, 0.7, 0.1, 'triangle', 0.25); this.burst(0.6, 0.12, 'highpass', 2000, 1, 400); break;
      case 'respawn': [392, 523, 659].forEach((f, i) => this.bell(t + i * 0.06, f, 0.05, this.sfx, 1.0)); break;
      case 'lampUp': this.tone(440, 0.22, 0.06, 'sine', 1.5); break;
      case 'lampDown': this.tone(520, 0.22, 0.06, 'sine', 0.66); break;
      case 'place': this.tone(330, 0.3, 0.1, 'triangle', 0.8); this.burst(0.12, 0.1, 'lowpass', 900); break;
      case 'pick': this.tone(330, 0.25, 0.08, 'triangle', 1.3); break;
      case 'warn': this.burst(1.4, 0.16, 'lowpass', 120, 1, 60); break;
      case 'thunder': this.burst(2.4, 0.55, 'lowpass', 900, 0.7, 60); this.burst(0.25, 0.4, 'highpass', 1500, 0.8); break;
      case 'hit': this.tone(120, 0.3, 0.2, 'square', 0.5); this.burst(0.2, 0.2, 'lowpass', 600); break;
      case 'hollowDie': this.burst(0.5, 0.2, 'highpass', 1200, 1, 5000); this.tone(200, 0.4, 0.08, 'sawtooth', 0.3); break;
      case 'hollowGrowl': this.tone(70 + Math.random() * 20, 0.6, 0.06, 'sawtooth', 0.8); break;
      case 'tap': this.tone(900, 0.05, 0.03, 'sine'); break;
      case 'type': this.tone(1200 + Math.random() * 300, 0.03, 0.012, 'sine'); break;
      case 'choice': this.bell(t, 880, 0.06, this.sfx, 0.6); break;
      case 'match': [659, 831, 988, 1319].forEach((f, i) => this.bell(t + i * 0.1, f, 0.08, this.sfx, 1.6)); break;
      case 'mismatch': [494, 440].forEach((f, i) => this.bell(t + i * 0.15, f, 0.07, this.sfx, 1.0)); break;
      case 'complete': [523, 659, 784, 1047].forEach((f, i) => this.bell(t + i * 0.11, f, 0.08, this.sfx, 2.0)); break;
      case 'heart': this.tone(60, 0.18, 0.25, 'sine', 0.7); this.tone(55, 0.2, 0.2, 'sine', 0.7, 0.22); break;
      case 'love': [988, 1319, 1760].forEach((f, i) => this.bell(t + i * 0.06, f, 0.05, this.sfx, 0.8)); break;
      case 'beep': this.tone(1320, 0.12, 0.05, 'sine'); break;
      case 'shine': [392, 587, 784, 1175, 1568, 2349].forEach((f, i) => this.bell(t + i * 0.12, f, 0.08, this.sfx, 3)); break;
      case 'card': this.bell(t, 392, 0.06, this.sfx, 3); this.bell(t + 0.3, 587, 0.05, this.sfx, 3); break;
      default: break;
    }
  }
}
