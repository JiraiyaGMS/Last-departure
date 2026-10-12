/**
 * scares.js — the director.
 *
 * Random jumpscares get boring in about ninety seconds, so nothing here fires at
 * random. A tension value rises with the hour, his proximity, the dark and how
 * long nothing has happened, and the director spends it on beats from a weighted
 * pool with per-beat cooldowns.
 *
 * The important rule, and the one the doc hands us: the hum cuts out right before
 * something happens. So most beats are scheduled as a PAIR — the hum dies, then
 * one and a half to three seconds of real silence, then the beat. After the third
 * time, the player has learned what silence means, and the silence itself does the
 * work. That is free, and it is worse than a noise.
 */
import * as THREE from 'three';

export class Director {
  constructor(ctx) {
    this.ctx = ctx;                 // {scene, player, collider, audio, lights, loop, attendant, ps1, ui, notebook}
    this.tension = 0;
    this.calm = 0;                  // seconds since the last beat
    this.nextIn = 26 + Math.random() * 20;
    this.cool = Object.create(null);
    this.lastKind = '';
    this.pending = null;            // the beat waiting out the silence
    this.silenceLeft = 0;
    this.cameraGhost = 0;           // 0..1, how close the Thing is on camera 4
    this.glimpse = this._makeGlimpse();
    this.glimpseLeft = 0;
    this.beatCount = 0;
    this.presence = 0;              // the pulse the shader reads
  }

  _makeGlimpse() {
    const g = new THREE.Group();
    // a flat, unlit, featureless silhouette. The absence of detail is the point.
    // Not pure black: a black figure in an unlit room is nothing at all. This is
    // just light enough to be a shape, and the director prefers to stand it in
    // front of a working tube so it occludes something.
    const mat = new THREE.MeshBasicMaterial({ color: 0x0d1117, transparent: true, opacity: 0.96, fog: false });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.22), mat);
    body.position.y = 1.25;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.22), mat);
    head.position.y = 2.05;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.82, 0.2), mat);
    legs.position.y = 0.42;
    g.add(body, head, legs);
    g.visible = false;
    g.name = 'glimpse';
    this.glimpseMat = mat;
    this.ctx.scene.add(g);
    return g;
  }

  reset() {
    this.tension = 0; this.calm = 0;
    this.nextIn = 30 + Math.random() * 18;
    this.pending = null; this.silenceLeft = 0;
    this.glimpse.visible = false; this.glimpseLeft = 0;
    this.cool = Object.create(null);
    this.beatCount = 0;
  }

  // ── the pool ──────────────────────────────────────────────────────────────

  _pool() {
    const { loop, attendant, player } = this.ctx;
    const night = loop.progress;                 // 0 at 11:47, 1 at 3:33
    const far = attendant.distToPlayer > 16;
    const dark = this._darkness() > 0.6;

    return [
      { kind: 'humcut_only', w: 1.4, cd: 40, silent: false },
      { kind: 'knock',       w: 2.2, cd: 34 },
      { kind: 'lightout',    w: 2.0 + night * 1.6, cd: 38 },
      { kind: 'flap',        w: 1.5, cd: 50 },
      { kind: 'presence',    w: 1.6 + night * 1.4, cd: 44 },
      { kind: 'glimpse',     w: far ? 2.6 + night * 2.0 : 0.4, cd: 46 },
      { kind: 'behind',      w: (dark ? 2.4 : 1.1) + night * 1.8, cd: 58 },
      { kind: 'creak',       w: 1.6, cd: 36 },
      { kind: 'namecall',    w: night > 0.25 ? 1.8 : 0, cd: 95 },
      { kind: 'ghostcam',    w: night > 0.45 ? 1.4 : 0, cd: 80 },
      { kind: 'echowhisper', w: 1.2 + night, cd: 42 },
    ].filter(b => b.w > 0 && (this.cool[b.kind] || 0) <= 0);
  }

  _darkness() {
    const { lights, player } = this.ctx;
    const l = lights.nearestLive(player.pos, 0, 14);
    if (!l) return 1;
    const d = l.pos.distanceTo(player.pos);
    return THREE.MathUtils.clamp(d / 14, 0, 1) * (1 - Math.min(1, l.level));
  }

  // ── update ────────────────────────────────────────────────────────────────

  update(dt) {
    const { loop, attendant, player, audio, ps1 } = this.ctx;
    if (!loop.running) return;

    for (const k in this.cool) this.cool[k] = Math.max(0, this.cool[k] - dt);

    // tension: the hour, how near he is, how dark it is, and how long it has
    // been quiet. Being safe for a long time is itself a reason to be afraid.
    const night = loop.progress;
    const prox = THREE.MathUtils.clamp(1 - attendant.distToPlayer / 26, 0, 1);
    this.calm += dt;
    const boredom = THREE.MathUtils.clamp(this.calm / 70, 0, 1);
    this.tension = THREE.MathUtils.clamp(
      night * 0.4 + prox * 0.3 + this._darkness() * 0.15 + boredom * 0.3, 0, 1);

    this.presence = THREE.MathUtils.damp(this.presence, 0, 1.4, dt);

    // the glimpse vanishes the moment you look straight at it
    if (this.glimpse.visible) {
      this.glimpseLeft -= dt;
      const to = this.glimpse.position.clone().setY(1.4).sub(player.eyePosition()).normalize();
      const centred = player.forward().dot(to);
      if (centred > 0.985 || this.glimpseLeft <= 0) {
        this.glimpse.visible = false;
        if (centred > 0.985) {
          // caught looking. A single breath, and the hum dies.
          audio.play('breathIn', { vol: 0.5, rate: 0.8 });
          audio.cutHum(2.6);
          this.presence = 1;
        }
      }
    }

    // a queued beat waits out the silence it earned
    if (this.pending) {
      this.silenceLeft -= dt;
      if (this.silenceLeft <= 0) {
        const b = this.pending; this.pending = null;
        this._fire(b);
      }
      return;
    }

    this.nextIn -= dt * (0.55 + this.tension * 1.5);
    if (this.nextIn > 0) return;

    const pool = this._pool();
    if (!pool.length) { this.nextIn = 8; return; }

    // never the same beat twice running
    const choices = pool.filter(b => b.kind !== this.lastKind);
    const use = choices.length ? choices : pool;
    let total = use.reduce((s, b) => s + b.w, 0);
    let r = Math.random() * total;
    let beat = use[use.length - 1];
    for (const b of use) { r -= b.w; if (r <= 0) { beat = b; break; } }

    this.cool[beat.kind] = beat.cd;
    this.lastKind = beat.kind;
    this.calm = 0;
    this.nextIn = THREE.MathUtils.lerp(44, 17, this.tension) + Math.random() * 12;
    this.beatCount++;

    if (beat.silent === false || beat.kind === 'humcut_only') {
      this._fire(beat);
    } else {
      // the tell: kill the hum, then nothing at all, then the beat
      this.ctx.audio.cutHum(4.2);
      this.pending = beat;
      this.silenceLeft = 1.5 + Math.random() * 1.6;
    }
  }

  // ── the beats ─────────────────────────────────────────────────────────────

  _fire(beat) {
    const f = this['_' + beat.kind];
    if (f) f.call(this);
  }

  _humcut_only() {
    this.ctx.audio.cutHum(3.4);
    this.presence = 0.5;
  }

  /** a bang from a room you are not in */
  _knock() {
    const { scene, audio, player, nav } = this.ctx;
    const p = this._pointNear(12, 24);
    if (!p) return;
    audio.at(scene, Math.random() < 0.5 ? 'knock' : 'clunk', p,
      { vol: 0.95, rate: 0.7 + Math.random() * 0.4, ref: 7, max: 70, verb: 0.7 });
    this.presence = 0.4;
  }

  /** the light behind you goes out */
  _lightout() {
    const { lights, player, audio, scene } = this.ctx;
    // prefer one that is behind the player, so they turn round into the dark
    const fwd = player.forward();
    let best = null, bs = -Infinity;
    for (const l of lights.lights) {
      if (l.dead) continue;
      const to = l.pos.clone().sub(player.eyePosition());
      const d = to.length();
      if (d > 22 || d < 3) continue;
      const behind = -fwd.dot(to.normalize());
      const score = behind * 2 + (1 - d / 22);
      if (score > bs) { bs = score; best = l; }
    }
    if (!best) return;
    best.kill();
    audio.at(scene, 'lightOut', best.pos, { vol: 0.8, ref: 6, max: 50, verb: 0.6 });
    this.presence = 0.55;
  }

  _flap() {
    const { scene, audio } = this.ctx;
    audio.at(scene, 'flap', new THREE.Vector3(0, 3.5, -5.6),
      { vol: 1.0, ref: 10, max: 80, verb: 0.8 });
    this.ctx.ui?.flashBoard?.();
    this.presence = 0.35;
  }

  /** nothing visible, nothing audible but a wall of sub-bass */
  _presence() {
    this.ctx.audio.play('presence', { vol: 0.6, verb: 0.3 });
    this.presence = 1;
  }

  /** a silhouette at the far end of a sightline, gone if you look at it */
  _glimpse() {
    const { player, collider, nav, loop } = this.ctx;
    const eye = player.eyePosition();
    const fwd = player.forward();
    // find an open cell that is visible, far, and well off the centre of view
    let best = null, bs = -Infinity;
    for (let i = 0; i < 90; i++) {
      const ang = player.yaw + Math.PI + (Math.random() - 0.5) * 2.4;
      const dist = 9 + Math.random() * 17;
      const p = new THREE.Vector3(
        player.pos.x + Math.sin(ang) * dist, 0, player.pos.z + Math.cos(ang) * dist);
      const k = nav.idx(p.x, p.z);
      if (!nav.isOpen(k)) continue;
      const w = nav.world(k);
      if (!collider.canSee(eye, w.clone().setY(1.5))) continue;
      const to = w.clone().setY(1.4).sub(eye).normalize();
      const off = fwd.dot(to);
      if (off > 0.93) continue;                        // not dead ahead
      // standing it near a live tube means it blocks light, which is what makes
      // a silhouette legible at all
      const lit = this.ctx.lights.nearestLive(w, 0, 12);
      const litBonus = lit ? (1 - lit.pos.distanceTo(w) / 12) * 1.2 : 0;
      const score = (off > 0.3 ? off : -1) + (w.distanceTo(player.pos) / 26) + litBonus;
      if (score > bs) { bs = score; best = w; }
    }
    if (!best) return;
    this.glimpse.position.set(best.x, 0, best.z);
    this.glimpse.lookAt(player.pos.x, 0, player.pos.z);
    this.glimpse.visible = true;
    this.glimpseLeft = 2.2 + Math.random() * 2.4;
    this.presence = 0.45;
  }

  /** one breath, right behind your head. Nothing is there. */
  _behind() {
    const { audio, ps1 } = this.ctx;
    audio.play('breathOut', { vol: 0.55, rate: 0.72 });
    audio.play('presence', { vol: 0.3, delay: 0.1 });
    this.presence = 1;
    // a single frame of the vignette slamming shut
    this.ctx.ui?.pulseNear?.(1.0, 1400);
  }

  _creak() {
    const { scene, audio } = this.ctx;
    const p = this._pointNear(5, 16);
    if (!p) return;
    audio.at(scene, 'creak', p, { vol: 0.7, rate: 0.8 + Math.random() * 0.5, ref: 5, max: 40, verb: 0.5 });
    this.presence = 0.3;
  }

  /** the PA uses your name. The rules say not to answer it. */
  _namecall() {
    const { audio, notebook, ui } = this.ctx;
    const n = notebook.data.name || 'passenger';
    const lines = [
      `Paging ${n}. Please come to the ticket window.`,
      `${n}, your bus is boarding. ${n}.`,
      `Would ${n} please identify themselves to the night attendant.`,
      `${n}. We know you are still in the building.`,
    ];
    audio.say(lines[(Math.random() * lines.length) | 0], { voice: 'pa', name: true });
    ui?.offerAnswer?.(7.0);
    this.presence = 0.7;
  }

  /** the Thing moves one camera closer */
  _ghostcam() {
    this.cameraGhost = Math.min(1, this.cameraGhost + 0.34);
    this.ctx.audio.play('presence', { vol: 0.22 });
    this.ctx.notebook.clue('cam4', 'Something uses camera 4. It is closer every loop.',
      this.ctx.loop.loop);
  }

  _echowhisper() {
    const { audio } = this.ctx;
    const lines = [
      'Don’t tell them the time.',
      'He isn’t the one you should be hiding from.',
      'Fourteen. There were fourteen of us.',
      'The mirror has the real ones.',
      'Bay nine. Only bay nine.',
      'It is on camera four again.',
    ];
    audio.say(lines[(Math.random() * lines.length) | 0], { voice: 'echo' });
    this.presence = 0.5;
  }

  /** an open nav cell between min and max metres away, preferring out of sight */
  _pointNear(min, max) {
    const { player, nav, collider } = this.ctx;
    const eye = player.eyePosition();
    for (let i = 0; i < 60; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = min + Math.random() * (max - min);
      const p = new THREE.Vector3(player.pos.x + Math.sin(ang) * d, 0, player.pos.z + Math.cos(ang) * d);
      const k = nav.idx(p.x, p.z);
      if (!nav.isOpen(k)) continue;
      const w = nav.world(k);
      if (collider.canSee(eye, w.clone().setY(1.5))) continue;   // unseen is better
      return w.setY(1.1);
    }
    return null;
  }
}
