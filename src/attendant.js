/**
 * attendant.js — Walter Penn, the Night Attendant.
 *
 * A state machine over the nav grid: Patrol, Investigate, Hunt, Stalk, Wait.
 * He never runs. He is slower than a walking player, which is the whole design:
 * he cannot win a chase, so he wins by knowing the building and by being
 * somewhere you did not expect. He always takes the shortest real route.
 *
 * The keyring is the tell the doc hangs the tension on, so it is implemented
 * literally: the jingle is emitted per footfall from his position in 3D, and it
 * STOPS when he stops. Silence means he is close and standing still, listening.
 */
import * as THREE from 'three';

export const ST = {
  PATROL: 'patrol', INVESTIGATE: 'investigate',
  HUNT: 'hunt', STALK: 'stalk', WAIT: 'wait', GRAB: 'grab',
};

const SPEED = { patrol: 1.3, investigate: 1.55, hunt: 1.85, stalk: 0 };
const EYE = 1.78;
const CATCH_R = 1.15;

export class Attendant {
  constructor({ scene, nav, collider, patrol, spawn, bay9, audio }) {
    this.scene = scene; this.nav = nav; this.collider = collider;
    this.audio = audio;
    this.patrolPts = patrol.map(p => p.pos.clone());
    this.spawn = spawn.clone();
    this.bay9 = new THREE.Vector3(...bay9);

    this.pos = this.spawn.clone();
    this.yaw = 0;
    this.headYaw = 0;
    this.state = ST.PATROL;
    this.speed = 0;
    this.path = [];
    this.wp = 0;
    this.patrolIdx = 0;
    this.patrolDir = 1;
    this.repathIn = 0;
    this.stateFor = 0;

    this.target = new THREE.Vector3();
    this.lastKnown = new THREE.Vector3();
    this.hasSeen = false;
    this.alert = 0;            // 0..1 suspicion
    this.seesPlayer = false;
    this.distToPlayer = 99;
    this.caught = false;

    this.stalkTimer = 0;
    this.standStill = 0;
    this._stepDist = 0;
    this._gait = 0;
    this.benevolent = false;   // the late-game twist, flipped from outside

    this.obj = this._build();
    this.obj.position.copy(this.pos);
    scene.add(this.obj);

    this._tmp = new THREE.Vector3();
    this._eye = new THREE.Vector3();
  }

  // ── the figure ────────────────────────────────────────────────────────────

  _build() {
    const g = new THREE.Group();
    g.name = 'attendant';

    const cloth = new THREE.MeshLambertMaterial({ color: 0x2b3340 });   // faded transit blue
    const dark  = new THREE.MeshLambertMaterial({ color: 0x14181d });
    // The head is kept dark on purpose. A pale head catches the tubes and reads
    // as a bright blank block; the doc wants a face you cannot find.
    const skin  = new THREE.MeshLambertMaterial({ color: 0x3a3429 });
    const voidm = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });

    const mk = (w, h, d, mat, y, x = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      return m;
    };

    // deliberately a head too tall and a touch too narrow for a person
    this.torso = mk(0.52, 0.86, 0.30, cloth, 1.30);
    this.hips  = mk(0.44, 0.22, 0.28, dark, 0.86);
    this.legL  = mk(0.17, 0.80, 0.19, dark, 0.40, -0.13);
    this.legR  = mk(0.17, 0.80, 0.19, dark, 0.40,  0.13);
    this.armL  = mk(0.13, 0.74, 0.15, cloth, 1.28, -0.33);
    this.armR  = mk(0.13, 0.74, 0.15, cloth, 1.28,  0.33);
    this.neck  = mk(0.14, 0.12, 0.14, skin, 1.79);

    this.head = new THREE.Group();
    this.head.position.y = 1.96;
    const skull = mk(0.25, 0.28, 0.24, skin, 0);
    const cap   = mk(0.29, 0.11, 0.28, dark, 0.18);
    // a deep brim, so what light there is never reaches under it
    const brim  = mk(0.31, 0.03, 0.20, dark, 0.13, 0, -0.21);
    const badge = mk(0.07, 0.04, 0.01, new THREE.MeshBasicMaterial({ color: 0x8a7a44, fog: false }),
                     0.19, 0, -0.145);
    // The face is never lit. It is a hole, and it sits proud of the head so no
    // angle ever catches an edge of it.
    const face  = mk(0.225, 0.19, 0.02, voidm, -0.005, 0, -0.128);
    this.head.add(skull, cap, brim, badge, face);

    // hips sway with the gait
    this.legs = new THREE.Group();
    this.legs.add(this.legL, this.legR);
    this.arms = new THREE.Group();
    this.arms.add(this.armL, this.armR);

    g.add(this.torso, this.hips, this.legs, this.arms, this.neck, this.head);

    // the keyring on his belt, where the sound comes from
    this.belt = new THREE.Object3D();
    this.belt.position.set(0.24, 0.88, 0.1);
    g.add(this.belt);

    g.visible = true;
    return g;
  }

  // ── state transitions ─────────────────────────────────────────────────────

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateFor = 0;
    this.path = []; this.wp = 0; this.repathIn = 0;
    if (s === ST.STALK) this.stalkTimer = 2.5 + Math.random() * 4.0;
  }

  reset() {
    this.pos.copy(this.spawn);
    this.obj.position.copy(this.pos);
    this.state = ST.PATROL;
    this.patrolIdx = 0; this.patrolDir = 1;
    this.path = []; this.wp = 0;
    this.alert = 0; this.hasSeen = false; this.caught = false;
    this.seesPlayer = false; this.distToPlayer = 99;
    this.stalkTimer = 0; this.standStill = 0;
  }

  /** a noise event from anywhere in the station */
  hear(ev) {
    if (this.state === ST.GRAB) return;
    const d = this.pos.distanceTo(ev.pos);
    const range = 6 + ev.loud * 26;          // a sprint carries most of the building
    if (d > range) return;
    const strength = (1 - d / range) * ev.loud;
    this.alert = Math.min(1, this.alert + strength * 0.9);
    if (this.alert > 0.35 || ev.reported) {
      this.lastKnown.copy(ev.pos);
      this.hasSeen = true;
      this.setState(ev.reported || this.alert > 0.8 ? ST.HUNT : ST.INVESTIGATE);
    }
  }

  /** breaking a posted rule reports your exact position, wherever he is */
  reportedAt(pos) {
    this.lastKnown.copy(pos);
    this.hasSeen = true;
    this.alert = 1;
    this.setState(ST.HUNT);
  }

  // ── update ────────────────────────────────────────────────────────────────

  update(dt, player, loop) {
    this.stateFor += dt;
    const ppos = player.pos;
    this.distToPlayer = this.pos.distanceTo(ppos);

    // --- senses ---
    this._eye.set(this.pos.x, EYE, this.pos.z);
    const pEye = player.eyePosition(this._tmp);
    const toP = pEye.clone().sub(this._eye);
    const dist = toP.length();
    toP.normalize();
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const facing = fwd.dot(new THREE.Vector3(toP.x, 0, toP.z).normalize());

    const concealed = !!player.hiding;
    const inCone = facing > 0.26 && dist < 24;
    const los = (inCone || dist < 3.2) && this.collider.canSee(this._eye, pEye);

    this.seesPlayer = !concealed && los;

    // the beam of a flashlight is noticed from much further than a body
    if (!concealed && player.beamHits(this.pos) && dist < 26) {
      this.alert = Math.min(1, this.alert + dt * 0.9);
      if (this.alert > 0.5) { this.lastKnown.copy(ppos); this.hasSeen = true; }
    }

    if (this.seesPlayer) {
      this.alert = Math.min(1, this.alert + dt * (dist < 8 ? 2.2 : 1.1));
      this.lastKnown.copy(ppos);
      this.hasSeen = true;
    } else {
      this.alert = Math.max(0, this.alert - dt * 0.12);
    }

    // hiding is not perfect: standing right next to him, breathing, he knows
    if (concealed && dist < 2.4 && !player.holding) {
      this.alert = Math.min(1, this.alert + dt * 0.8);
      if (this.alert > 0.92) { this.lastKnown.copy(ppos); this.setState(ST.HUNT); }
    }

    // --- state machine ---
    switch (this.state) {
      case ST.PATROL: this._patrol(dt, loop); break;
      case ST.INVESTIGATE: this._investigate(dt); break;
      case ST.HUNT: this._hunt(dt, ppos); break;
      case ST.STALK: this._stalk(dt, ppos); break;
      case ST.WAIT: this._wait(dt, ppos); break;
      case ST.GRAB: break;
    }

    // from 3:00 he gives up the route and stands at the only way out
    if (loop && loop.past('03:00') && this.state !== ST.HUNT && this.state !== ST.GRAB) {
      this.setState(ST.WAIT);
    }

    // --- the catch ---
    if (!this.caught && this.state !== ST.GRAB && dist < CATCH_R &&
        (!concealed || this.alert > 0.9)) {
      this.caught = true;
      this.setState(ST.GRAB);
    }

    this._animate(dt);
    this._sound(dt);
  }

  _speedFor() {
    if (this.state === ST.WAIT) return 1.4;
    return SPEED[this.state] ?? 0;
  }

  _patrol(dt, loop) {
    if (!this.path.length) {
      const goal = this.patrolPts[this.patrolIdx];
      this.path = this.nav.path(this.pos, goal);
      this.wp = 0;
      if (!this.path.length) { this._advancePatrol(); return; }
    }
    if (this._follow(dt, SPEED.patrol)) {
      this._advancePatrol();
      // every so often he stops at a waypoint and simply listens
      if (Math.random() < 0.30) { this.standStill = 1.6 + Math.random() * 3.4; }
    }
    if (this.alert > 0.55) this.setState(ST.INVESTIGATE);
  }

  _advancePatrol() {
    this.path = []; this.wp = 0;
    this.patrolIdx += this.patrolDir;
    if (this.patrolIdx >= this.patrolPts.length) { this.patrolIdx = this.patrolPts.length - 2; this.patrolDir = -1; }
    if (this.patrolIdx < 0) { this.patrolIdx = 1; this.patrolDir = 1; }
  }

  _investigate(dt) {
    this.repathIn -= dt;
    if (!this.path.length || this.repathIn <= 0) {
      this.path = this.nav.path(this.pos, this.lastKnown);
      this.wp = 0; this.repathIn = 1.4;
    }
    if (this._follow(dt, SPEED.investigate)) {
      // arrived where the noise was. He looks around, then goes back to the route.
      this.standStill = 2.2 + Math.random() * 2.5;
      if (this.alert < 0.3) this.setState(ST.PATROL);
      else this.setState(ST.STALK);
    }
    if (this.alert > 0.9 && this.seesPlayer) this.setState(ST.HUNT);
    if (this.stateFor > 26) this.setState(ST.PATROL);
  }

  _hunt(dt, ppos) {
    this.repathIn -= dt;
    if (!this.path.length || this.repathIn <= 0) {
      this.path = this.nav.path(this.pos, this.seesPlayer ? ppos : this.lastKnown);
      this.wp = 0; this.repathIn = 0.45;
    }
    this._follow(dt, SPEED.hunt);
    if (!this.seesPlayer && this.stateFor > 16 && this.pos.distanceTo(this.lastKnown) < 2.5) {
      this.setState(ST.STALK);
    }
    if (this.stateFor > 42) { this.alert = 0.4; this.setState(ST.PATROL); }
  }

  /**
   * The worst thing he does. He stops at the end of a sightline, faces the
   * player, and does not approach. The keys go quiet. Nothing happens for
   * several seconds.
   */
  _stalk(dt, ppos) {
    this.stalkTimer -= dt;
    this.standStill = Math.max(this.standStill, 0.1);
    if (this.stalkTimer <= 0) {
      this.setState(this.alert > 0.6 ? ST.HUNT : ST.PATROL);
    }
  }

  _wait(dt, ppos) {
    if (!this.path.length && this.pos.distanceTo(this.bay9) > 1.6) {
      this.path = this.nav.path(this.pos, this.bay9);
      this.wp = 0;
    }
    if (this.path.length) { this._follow(dt, 1.4); return; }
    // standing in front of the door, facing the concourse you have to come out of
    this.standStill = 0.2;
    if (this.seesPlayer && this.distToPlayer < 14) this.setState(ST.HUNT);
  }

  /** walk the current path; returns true on arrival */
  _follow(dt, speed) {
    if (this.standStill > 0) { this.standStill -= dt; this.speed = 0; return false; }
    if (!this.path.length) { this.speed = 0; return true; }

    const tgt = this.path[this.wp];
    if (!tgt) { this.speed = 0; return true; }

    const d = this._tmp.set(tgt.x - this.pos.x, 0, tgt.z - this.pos.z);
    const len = d.length();
    if (len < 0.3) {
      this.wp++;
      if (this.wp >= this.path.length) { this.path = []; this.wp = 0; this.speed = 0; return true; }
      return false;
    }
    d.divideScalar(len);
    const step = Math.min(speed * dt, len);
    this.pos.x += d.x * step;
    this.pos.z += d.z * step;
    this.speed = speed;

    // he turns his body smoothly, which makes the walk read as deliberate
    const want = Math.atan2(d.x, d.z);
    let diff = ((want - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.yaw += THREE.MathUtils.clamp(diff, -2.2 * dt, 2.2 * dt);
    this._stepDist += step;
    return false;
  }

  _animate(dt) {
    this.obj.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.obj.rotation.y = this.yaw;

    const walking = this.speed > 0.05;
    this._gait += dt * (walking ? this.speed * 2.3 : 0);
    const sw = Math.sin(this._gait);

    // a slow, flat-footed gait; almost no bounce, which is more wrong than a lot
    this.legL.rotation.x =  sw * 0.42;
    this.legR.rotation.x = -sw * 0.42;
    this.armL.rotation.x = -sw * 0.18;
    this.armR.rotation.x =  sw * 0.18;
    this.torso.position.y = 1.30 + Math.abs(sw) * 0.012;
    this.hips.rotation.y = sw * 0.06;

    // the head tracks the player even when the body is walking elsewhere
    if (this.seesPlayer || this.alert > 0.5) {
      const want = Math.atan2(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z) - this.yaw;
      let d = ((want + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      d = THREE.MathUtils.clamp(d, -1.25, 1.25);
      this.headYaw = THREE.MathUtils.damp(this.headYaw, d, 5, dt);
    } else {
      this.headYaw = THREE.MathUtils.damp(this.headYaw, sw * 0.1, 2, dt);
    }
    this.head.rotation.y = this.headYaw;
  }

  _sound(dt) {
    if (!this.audio?.ready) return;
    const moving = this.speed > 0.05 && this.standStill <= 0;

    // keys and footsteps are emitted together, per footfall, from his position.
    // When he stops, both stop. That silence is the mechanic.
    if (moving) {
      const stride = 0.92;
      if (this._stepDist >= stride) {
        this._stepDist = 0;
        const p = new THREE.Vector3(this.pos.x, 0.1, this.pos.z);
        this.audio.at(this.scene, 'stepHeavy', p,
          { vol: 0.55, rate: 0.92 + Math.random() * 0.1, ref: 5, max: 44, verb: 0.4 });
        const bp = new THREE.Vector3(this.pos.x, 0.95, this.pos.z);
        this.audio.at(this.scene, 'keys', bp,
          { vol: 0.42, rate: 0.9 + Math.random() * 0.22, ref: 4.5, max: 40, verb: 0.3 });
      }
    }
  }

  /** 0..1, how much of the screen he owns right now */
  dread(player) {
    const d = this.distToPlayer;
    let f = 0;
    if (d < 20) f = Math.max(f, (1 - d / 20) * 0.45);
    if (this.seesPlayer) f = Math.max(f, 0.55 + (1 - Math.min(1, d / 14)) * 0.45);
    if (this.state === ST.HUNT) f = Math.max(f, 0.5);
    if (this.state === ST.STALK && d < 16) f = Math.max(f, 0.62);
    if (player.hiding && d < 4) f = Math.max(f, 0.88);
    return THREE.MathUtils.clamp(f, 0, 1);
  }
}
