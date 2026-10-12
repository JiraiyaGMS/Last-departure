/**
 * audio.js — the whole soundtrack, synthesised.
 *
 * There are no audio files in this repo. Every sound the station makes is built
 * from noise and oscillators at load time, which suits the brief better than
 * samples would: the fluorescent hum is a real sustained tone that can be cut
 * dead on a frame, the keyring is re-randomised on every jingle so it never
 * loops recognisably, and the PA is a formant synth that sounds like a voice
 * saying something you cannot quite make out. Subtitles carry the words.
 *
 * Positional sources go through THREE.PositionalAudio so the Attendant can be
 * tracked by ear, which the doc makes the primary tell.
 */
import * as THREE from 'three';

const SR = 44100;

export class AudioEngine {
  constructor() {
    this.listener = new THREE.AudioListener();
    this.ctx = this.listener.context;
    this.ready = false;
    this.buffers = {};
    this.muted = false;
    this._subCb = null;
  }

  async init() {
    if (this.ready) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    // master chain: everything → a gentle limiter → destination
    const g = this.listener.gain;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;
    this.master.connect(this.comp);
    this.comp.connect(g);

    // a short concrete-room reverb for the PA and anything far away
    this.verb = this.ctx.createConvolver();
    this.verb.buffer = this._impulse(2.4, 0.9);
    this.verbGain = this.ctx.createGain();
    this.verbGain.gain.value = 0.34;
    this.verb.connect(this.verbGain);
    this.verbGain.connect(this.master);

    this._bake();
    this.ready = true;
  }

  onSubtitle(cb) { this._subCb = cb; }

  // ── buffer baking ─────────────────────────────────────────────────────────

  _buf(seconds, fill, channels = 1) {
    const n = Math.max(1, Math.floor(seconds * SR));
    const b = this.ctx.createBuffer(channels, n, SR);
    for (let c = 0; c < channels; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = fill(i / SR, i, n, c) || 0;
    }
    return b;
  }

  _impulse(seconds, decay) {
    return this._buf(seconds, (t, i, n) => {
      const e = Math.pow(1 - i / n, decay * 3);
      // a few discrete early reflections make it read as a hard-walled hall
      let s = (Math.random() * 2 - 1) * e;
      if (i % 2731 < 3) s += (Math.random() * 2 - 1) * e * 1.6;
      return s * 0.5;
    }, 2);
  }

  _bake() {
    const B = this.buffers;
    const rnd = () => Math.random() * 2 - 1;

    // ---- the keyring. Short metallic ticks, each a decaying high partial. ----
    B.keys = [];
    for (let v = 0; v < 5; v++) {
      B.keys.push(this._buf(0.42, (t) => {
        let s = 0;
        // four or five keys knocking together at slightly different times
        for (let k = 0; k < 5; k++) {
          const onset = 0.004 + k * (0.012 + v * 0.004);
          if (t < onset) continue;
          const u = t - onset;
          const f = 2100 + k * 640 + v * 170;
          const env = Math.exp(-u * (34 + k * 7));
          s += Math.sin(2 * Math.PI * f * u) * env * 0.22;
          s += Math.sin(2 * Math.PI * f * 1.51 * u) * env * 0.12;
          s += rnd() * env * 0.05;
        }
        return s * 0.8;
      }));
    }

    // ---- footsteps. Player: soft. Attendant: a slow, heavy, flat sole. ----
    B.step = [];
    for (let v = 0; v < 4; v++) {
      B.step.push(this._buf(0.17, (t) => {
        const env = Math.exp(-t * 48);
        const body = Math.sin(2 * Math.PI * (92 + v * 11) * t) * env * 0.5;
        const scuff = rnd() * Math.exp(-t * 90) * 0.3;
        return (body + scuff) * 0.6;
      }));
    }
    B.stepHeavy = [];
    for (let v = 0; v < 4; v++) {
      B.stepHeavy.push(this._buf(0.4, (t) => {
        const env = Math.exp(-t * 15);
        const thud = Math.sin(2 * Math.PI * (52 + v * 5) * t) * env * 0.9;
        const sub  = Math.sin(2 * Math.PI * 31 * t) * Math.exp(-t * 9) * 0.5;
        const leather = rnd() * Math.exp(-t * 55) * 0.18;
        return (thud + sub + leather) * 0.7;
      }));
    }

    // ---- the fluorescent hum: 120Hz plus its harmonics plus ballast buzz ----
    B.hum = this._buf(3.0, (t) => {
      let s = Math.sin(2 * Math.PI * 120 * t) * 0.30;
      s += Math.sin(2 * Math.PI * 240 * t) * 0.14;
      s += Math.sin(2 * Math.PI * 360 * t) * 0.07;
      s += Math.sin(2 * Math.PI * 60 * t) * 0.05;
      s += rnd() * 0.012;
      // a slow beat, so it never sits still
      return s * (0.86 + 0.14 * Math.sin(2 * Math.PI * 0.21 * t));
    });

    // ---- room tone: wide, almost-silent air ----
    B.tone = this._buf(4.0, (t, i, n) => {
      const s = rnd() * 0.05;
      return s * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.07 * t));
    });

    // ---- the diesel at Bay 9, idling all night and never leaving ----
    B.diesel = this._buf(2.0, (t) => {
      // a lumpy four-stroke idle around 11Hz
      const lump = Math.max(0, Math.sin(2 * Math.PI * 10.8 * t));
      let s = Math.sin(2 * Math.PI * 44 * t) * 0.3 * (0.5 + lump);
      s += Math.sin(2 * Math.PI * 88 * t) * 0.12 * lump;
      s += Math.sin(2 * Math.PI * 22 * t) * 0.22;
      s += rnd() * 0.05 * (0.6 + lump);
      return s * 0.55;
    });

    // ---- the split-flap board turning over ----
    B.flap = this._buf(0.9, (t) => {
      let s = 0;
      for (let k = 0; k < 26; k++) {
        const on = k * 0.031;
        if (t < on) continue;
        const u = t - on;
        s += (rnd() * Math.exp(-u * 260) + Math.sin(2 * Math.PI * 1500 * u) * Math.exp(-u * 200) * 0.4) * 0.5;
      }
      return s * 0.4;
    });

    // ---- the catch: a conductor's hole punch, right beside your ear ----
    B.punch = this._buf(0.5, (t) => {
      const click = (t < 0.02) ? rnd() * Math.exp(-t * 400) * 1.0 : 0;
      const snap = Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 180) * 0.5;
      const ring = Math.sin(2 * Math.PI * 520 * t) * Math.exp(-t * 26) * 0.3;
      const body = Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 11) * 0.6;
      return click + snap + ring + body;
    });

    // ---- presence. A sub-bass swell that arrives before he does. ----
    B.presence = this._buf(3.4, (t, i, n) => {
      const e = Math.sin(Math.PI * (i / n)) ** 1.6;
      const f = 26 + 14 * (i / n);
      return (Math.sin(2 * Math.PI * f * t) * 0.8 + rnd() * 0.03) * e;
    });

    // ---- the stinger. Only ever on a catch. ----
    B.stinger = this._buf(2.2, (t, i, n) => {
      const e = Math.exp(-t * 1.5);
      let s = 0;
      // a cluster of detuned strings, bent downward
      for (const f of [196, 207, 233, 294, 311]) {
        s += Math.sin(2 * Math.PI * f * (1 - t * 0.09) * t) * 0.13;
      }
      s += rnd() * 0.22 * Math.exp(-t * 9);
      s += Math.sin(2 * Math.PI * 41 * t) * 0.5 * Math.exp(-t * 1.1);
      return s * e;
    });

    // ---- heartbeat ----
    B.heart = this._buf(0.6, (t) => {
      const one = Math.sin(2 * Math.PI * 48 * t) * Math.exp(-t * 17);
      const u = t - 0.21;
      const two = u > 0 ? Math.sin(2 * Math.PI * 42 * u) * Math.exp(-u * 20) * 0.75 : 0;
      return (one + two) * 0.85;
    });

    // ---- breathing, for hiding ----
    B.breathIn = this._buf(0.8, (t, i, n) => {
      const e = Math.sin(Math.PI * (i / n));
      return rnd() * e * 0.35;
    });
    B.breathOut = this._buf(1.1, (t, i, n) => {
      const e = Math.pow(Math.sin(Math.PI * (i / n)), 1.4);
      return rnd() * e * 0.4;
    });
    B.gasp = this._buf(0.9, (t, i, n) => {
      const e = Math.pow(1 - i / n, 0.5) * Math.min(1, t * 24);
      return (rnd() * 0.55 + Math.sin(2 * Math.PI * 190 * t) * 0.12) * e;
    });

    // ---- clunks, knocks and creaks ----
    B.clunk = this._buf(0.6, (t) => {
      const e = Math.exp(-t * 13);
      return (Math.sin(2 * Math.PI * 128 * t) * 0.5 + rnd() * 0.3 * Math.exp(-t * 40)) * e;
    });
    B.knock = this._buf(1.2, (t) => {
      const e = Math.exp(-t * 7);
      return (Math.sin(2 * Math.PI * 84 * t) * 0.6 + Math.sin(2 * Math.PI * 171 * t) * 0.2
              + rnd() * 0.2 * Math.exp(-t * 30)) * e;
    });
    B.creak = this._buf(1.6, (t, i, n) => {
      const e = Math.sin(Math.PI * (i / n));
      // stick-slip: a sawtooth whose rate wanders
      const ph = t * (52 + 26 * Math.sin(t * 3.1));
      return ((ph % 1) - 0.5) * e * 0.3;
    });
    B.coin = this._buf(1.0, (t) => {
      let s = 0;
      for (let k = 0; k < 4; k++) {
        const on = k * 0.085 * (1 + k * 0.4);
        if (t < on) continue;
        const u = t - on;
        s += Math.sin(2 * Math.PI * (3100 - k * 180) * u) * Math.exp(-u * 24) * 0.2;
      }
      return s;
    });
    B.ticket = this._buf(1.5, (t, i, n) => {
      // a dot-matrix printer chewing out a stub
      const buzz = ((t * 190) % 1 - 0.5) * 0.3;
      const e = Math.min(1, t * 20) * Math.max(0, 1 - (i / n) ** 4);
      return (buzz + rnd() * 0.1) * e;
    });
    B.bell = this._buf(2.6, (t) => {
      let s = 0;
      for (const [f, a] of [[1320, 0.4], [1980, 0.2], [2640, 0.1]])
        s += Math.sin(2 * Math.PI * f * t) * a * Math.exp(-t * 2.6);
      return s;
    });
    B.lightOut = this._buf(1.3, (t) => {
      const snap = t < 0.03 ? rnd() * Math.exp(-t * 180) * 0.8 : 0;
      const die = Math.sin(2 * Math.PI * 120 * t) * Math.exp(-t * 11) * 0.3;
      return snap + die;
    });
    B.lightOn = this._buf(1.0, (t) => {
      // the stutter of a tube striking
      let s = 0;
      for (const on of [0.0, 0.08, 0.13, 0.26]) {
        if (t < on) continue;
        const u = t - on;
        s += (rnd() * 0.5 + Math.sin(2 * Math.PI * 360 * u) * 0.3) * Math.exp(-u * 50);
      }
      return s * 0.6;
    });

    // ---- the jukebox. An original, badly-aged 1987 slow number. ----
    B.juke = this._bakeJukebox();

    // ---- tape hiss bed for the PA ----
    B.hiss = this._buf(2.0, () => rnd() * 0.06);
  }

  _bakeJukebox() {
    // Am – F – C – G, waltzed, played on a detuned electric piano through a
    // speaker that has been in a damp building since the Reagan administration.
    const chords = [[220, 262, 330], [175, 220, 262], [196, 247, 330], [196, 294, 392]];
    const bar = 2.4, total = bar * 8;
    const mel = [659, 587, 523, 587, 659, 784, 659, 587];
    return this._buf(total, (t) => {
      const bi = Math.floor(t / bar) % 4;
      const u = t % bar;
      let s = 0;
      // the wow-and-flutter of a worn mechanism
      const wob = 1 + 0.009 * Math.sin(2 * Math.PI * 0.7 * t) + 0.004 * Math.sin(2 * Math.PI * 5.3 * t);
      for (const f of chords[bi]) {
        const env = Math.exp(-u * 1.2) * 0.1;
        s += Math.sin(2 * Math.PI * f * wob * u) * env;
        s += Math.sin(2 * Math.PI * f * 2 * wob * u) * env * 0.3;
      }
      // melody, one note a bar, a semitone flat and getting flatter
      const mi = Math.floor(t / bar) % 8;
      const mu = u;
      if (mu < 1.6) {
        const sag = 1 - (t / total) * 0.03;
        s += Math.sin(2 * Math.PI * mel[mi] * wob * sag * mu) * Math.exp(-mu * 1.6) * 0.09;
      }
      // bass on the one
      if (u < 0.9) s += Math.sin(2 * Math.PI * chords[bi][0] * 0.5 * u) * Math.exp(-u * 2.4) * 0.14;
      return s + (Math.random() * 2 - 1) * 0.008;
    });
  }

  // ── playback ──────────────────────────────────────────────────────────────

  _pick(name) {
    const b = this.buffers[name];
    return Array.isArray(b) ? b[(Math.random() * b.length) | 0] : b;
  }

  /** a non-positional one-shot */
  play(name, { vol = 1, rate = 1, verb = 0, delay = 0 } = {}) {
    if (!this.ready || this.muted) return null;
    const b = this._pick(name);
    if (!b) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(this.master);
    if (verb > 0) {
      const vg = this.ctx.createGain();
      vg.gain.value = verb;
      g.connect(vg); vg.connect(this.verb);
    }
    src.start(this.ctx.currentTime + delay);
    return { src, gain: g };
  }

  /** a positional one-shot, parented to the scene at `pos` */
  at(scene, name, pos, { vol = 1, rate = 1, ref = 4, max = 60, verb = 0.25 } = {}) {
    if (!this.ready || this.muted) return null;
    const b = this._pick(name);
    if (!b) return null;
    const a = new THREE.PositionalAudio(this.listener);
    a.setBuffer(b);
    a.setRefDistance(ref);
    a.setMaxDistance(max);
    a.setRolloffFactor(1.6);
    a.setDistanceModel('exponential');
    a.setVolume(vol);
    a.playbackRate = rate;
    a.position.copy(pos);
    scene.add(a);
    a.play();
    a.source.onended = () => { try { scene.remove(a); a.disconnect(); } catch {} };
    if (verb > 0) {
      const vg = this.ctx.createGain(); vg.gain.value = verb * vol;
      a.getOutput().connect(vg); vg.connect(this.verb);
    }
    return a;
  }

  /** a looping positional source bolted to an Object3D */
  loopOn(obj, name, { vol = 1, rate = 1, ref = 3, max = 40 } = {}) {
    if (!this.ready) return null;
    const b = this._pick(name);
    if (!b) return null;
    const a = new THREE.PositionalAudio(this.listener);
    a.setBuffer(b);
    a.setLoop(true);
    a.setRefDistance(ref);
    a.setMaxDistance(max);
    a.setRolloffFactor(1.8);
    a.setDistanceModel('exponential');
    a.setVolume(vol);
    a.playbackRate = rate;
    obj.add(a);
    a.play();
    return a;
  }

  /** a looping non-positional bed */
  bed(name, vol = 0.3, rate = 1) {
    if (!this.ready) return null;
    const b = this._pick(name);
    if (!b) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = b; src.loop = true; src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(this.master);
    src.start();
    return { src, gain: g,
      set(v, ramp = 0.25) {
        const now = src.context.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setTargetAtTime(v, now, Math.max(0.01, ramp / 3));
      },
      stop() { try { src.stop(); } catch {} } };
  }

  // ── the hum, and cutting it ───────────────────────────────────────────────

  startBeds() {
    this.humBed = this.bed('hum', 0.09);
    this.toneBed = this.bed('tone', 0.1);
    this._humLevel = 0.09;
  }

  /**
   * Kill the hum, then bring it back. The doc asks for the hum to cut out right
   * before something happens; silence is the loudest thing in the building.
   */
  cutHum(seconds = 2.2) {
    if (!this.humBed) return;
    this.humBed.set(0.0, 0.08);
    this.toneBed?.set(0.015, 0.1);
    clearTimeout(this._humTimer);
    this._humTimer = setTimeout(() => {
      this.humBed?.set(this._humLevel, 1.2);
      this.toneBed?.set(0.1, 1.2);
      this.play('lightOn', { vol: 0.25, verb: 0.3 });
    }, seconds * 1000);
  }

  setHum(v) { this._humLevel = v; this.humBed?.set(v, 0.6); }

  // ── the PA ────────────────────────────────────────────────────────────────

  /**
   * Say something over the PA. The audio is a formant synth driven by the
   * syllables of `text`, so the cadence matches the words on screen without ever
   * being quite intelligible. `name` utterances get an extra pitch drop, because
   * the PA saying your own name should not sound like the rest of it.
   */
  say(text, { voice = 'pa', name = false, onSub = true } = {}) {
    if (onSub && this._subCb) this._subCb(text, voice);
    if (!this.ready || this.muted) return 0;

    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.05;
    const syll = Math.max(2, Math.min(44, text.replace(/[^a-z’']/gi, '').length / 2.6));
    const dur = syll * 0.168 + 0.5;

    const out = ctx.createGain();
    out.gain.value = voice === 'echo' ? 0.26 : 0.4;

    // telephone band, then a little grit
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = voice === 'echo' ? 780 : 1150;
    band.Q.value = voice === 'echo' ? 1.4 : 0.9;

    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 512) - 1;
      curve[i] = Math.tanh(x * (voice === 'echo' ? 1.5 : 3.2));
    }
    shaper.curve = curve;

    band.connect(shaper); shaper.connect(out);
    out.connect(this.master);
    const vg = ctx.createGain(); vg.gain.value = voice === 'echo' ? 0.7 : 0.5;
    out.connect(vg); vg.connect(this.verb);

    // the carrier: a buzzy pulse train, pitch wandering like worn tape
    const base = voice === 'echo' ? 96 : 118;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = base;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = base * 0.5;
    const oscG = ctx.createGain(); oscG.gain.value = 0.0;
    const osc2G = ctx.createGain(); osc2G.gain.value = 0.0;
    osc.connect(oscG); osc2.connect(osc2G);

    // three formants make it read as a mouth
    const F = [[520, 5], [1200, 7], [2550, 9]];
    for (const [f, q] of F) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const fg = ctx.createGain(); fg.gain.value = 0.6;
      oscG.connect(bp); osc2G.connect(bp); bp.connect(fg); fg.connect(band);
      // vowels move
      bp.frequency.setValueAtTime(f, t0);
      for (let s = 0; s < syll; s++) {
        bp.frequency.linearRampToValueAtTime(
          f * (0.82 + Math.random() * 0.4), t0 + s * 0.168 + 0.1);
      }
    }

    // syllable envelope
    const now = t0;
    oscG.gain.setValueAtTime(0.0001, now);
    osc2G.gain.setValueAtTime(0.0001, now);
    for (let s = 0; s < syll; s++) {
      const a = now + s * 0.168;
      const loud = 0.16 + Math.random() * 0.12;
      oscG.gain.linearRampToValueAtTime(loud, a + 0.035);
      oscG.gain.linearRampToValueAtTime(0.012, a + 0.14);
      osc2G.gain.linearRampToValueAtTime(loud * 0.5, a + 0.04);
      osc2G.gain.linearRampToValueAtTime(0.006, a + 0.14);
      // intonation
      osc.frequency.linearRampToValueAtTime(base * (0.9 + Math.random() * 0.26), a + 0.08);
    }
    const end = now + syll * 0.168;
    oscG.gain.linearRampToValueAtTime(0.0001, end + 0.2);
    osc2G.gain.linearRampToValueAtTime(0.0001, end + 0.2);

    if (name) {
      // the pitch sags on a name, as though the tape slowed to get it right
      osc.frequency.linearRampToValueAtTime(base * 0.72, end + 0.18);
      osc2.frequency.linearRampToValueAtTime(base * 0.36, end + 0.18);
    }

    osc.start(now); osc2.start(now);
    osc.stop(end + 0.5); osc2.stop(end + 0.5);

    // tape hiss and a click on and off, as if the channel opened
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.buffers.hiss; hiss.loop = true;
    const hg = ctx.createGain(); hg.gain.value = 0;
    hiss.connect(hg); hg.connect(out);
    hg.gain.setValueAtTime(0, now);
    hg.gain.linearRampToValueAtTime(0.5, now + 0.03);
    hg.gain.setValueAtTime(0.5, end);
    hg.gain.linearRampToValueAtTime(0, end + 0.3);
    hiss.start(now); hiss.stop(end + 0.4);

    if (voice === 'pa') {
      this.play('bell', { vol: 0.1, rate: 1.4, verb: 0.5 });
    }
    return dur;
  }

  // ── stateful loops driven from the game ───────────────────────────────────

  startHeart() {
    this._heartOn = false;
    this._heartNext = 0;
    this._heartRate = 0;
  }
  /** 0 = calm and silent, 1 = he is on top of you */
  setHeart(level) { this._heartRate = THREE.MathUtils.clamp(level, 0, 1); }

  tick(now) {
    if (!this.ready) return;
    const r = this._heartRate;
    if (r > 0.08) {
      const interval = THREE.MathUtils.lerp(1.05, 0.38, r);
      if (now > this._heartNext) {
        this._heartNext = now + interval;
        this.play('heart', { vol: 0.07 + r * 0.3, rate: 0.9 + r * 0.35 });
      }
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }
}
