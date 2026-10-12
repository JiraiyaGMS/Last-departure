/**
 * echoes.js — the fourteen passengers of November 3, 1987.
 *
 * Mostly harmless and mostly still. They mutter. The one thing they do that the
 * doc does not strictly require, and which is worth the code, is move only while
 * unobserved: an Echo you are not looking at closes the distance a little. You
 * never catch one moving. You only ever notice that it is nearer.
 */
import * as THREE from 'three';
import { ECHOES } from './station.js';

export class Echo {
  constructor(def, scene, audio) {
    this.def = def;
    this.scene = scene;
    this.audio = audio;
    this.home = new THREE.Vector3(...def.pos);
    this.pos = this.home.clone();
    this.yaw = def.rot || 0;
    this.heard = false;         // has the player heard its full story
    this.mutterIn = 2 + Math.random() * 14;
    this.drift = 0;
    this.observedFor = 0;
    this.obj = this._build();
    this.obj.position.copy(this.pos);
    this.obj.rotation.y = this.yaw;
    scene.add(this.obj);
  }

  _build() {
    const g = new THREE.Group();
    g.name = `echo_${this.def.id}`;
    // washed out, faintly lit from nowhere, and see-through enough to doubt
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8fa6b8, transparent: true, opacity: 0.30,
      depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    this.mat = mat;
    const mk = (w, h, d, y, x = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); g.add(m); return m;
    };
    const seated = this.def.pos[1] === 0 && /bench|hatbox|work coat/.test(this.def.name);
    if (seated) {
      mk(0.46, 0.62, 0.26, 1.08);        // torso
      mk(0.40, 0.22, 0.46, 0.60, 0, 0.14); // thighs
      mk(0.15, 0.52, 0.15, 0.30, -0.12, 0.34);
      mk(0.15, 0.52, 0.15, 0.30,  0.12, 0.34);
      this.headM = mk(0.22, 0.25, 0.21, 1.52);
    } else {
      mk(0.44, 0.74, 0.25, 1.22);
      mk(0.16, 0.80, 0.18, 0.42, -0.12);
      mk(0.16, 0.80, 0.18, 0.42,  0.12);
      this.headM = mk(0.22, 0.25, 0.21, 1.74);
    }
    return g;
  }

  /** the player is looking at this Echo right now */
  isObserved(player, collider) {
    const eye = player.eyePosition();
    const to = this.pos.clone().setY(1.4).sub(eye);
    const d = to.length();
    if (d > 26) return false;
    to.normalize();
    if (player.forward().dot(to) < 0.55) return false;
    return collider.canSee(eye, this.pos.clone().setY(1.4));
  }

  update(dt, player, collider, loop) {
    const d = this.pos.distanceTo(player.pos);
    const observed = this.isObserved(player, collider);

    // fade in as you get close; they are never quite solid
    const want = d > 30 ? 0 : THREE.MathUtils.clamp(0.10 + (1 - d / 30) * 0.3, 0, 0.42);
    this.mat.opacity = THREE.MathUtils.damp(this.mat.opacity, want, 3, dt);

    if (observed) {
      this.observedFor += dt;
      // a head that turns to follow you, very slowly, only when you watch it
      const want = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z) - this.yaw;
      let dd = ((want + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      dd = THREE.MathUtils.clamp(dd, -0.9, 0.9);
      if (this.headM) this.headM.rotation.y = THREE.MathUtils.damp(this.headM.rotation.y, dd, 0.6, dt);
    } else {
      this.observedFor = 0;
      // unobserved, it closes in — but never past arm's length, and never further
      // than a few metres from where it has waited since 1987
      if (d > 2.2 && d < 22 && this.drift < 5.5) {
        const step = dt * 0.55;
        const dir = player.pos.clone().sub(this.pos).setY(0).normalize();
        this.pos.addScaledVector(dir, step);
        this.drift += step;
        this.yaw = Math.atan2(dir.x, dir.z);
      }
    }

    this.obj.position.copy(this.pos);
    this.obj.rotation.y = this.yaw;

    // muttering, when you are near enough to make out fragments
    this.mutterIn -= dt;
    if (this.mutterIn <= 0 && d < 9) {
      this.mutterIn = 9 + Math.random() * 16;
      const line = this.def.mutter[(Math.random() * this.def.mutter.length) | 0];
      this.audio?.say(line, { voice: 'echo' });
    } else if (this.mutterIn <= 0) {
      this.mutterIn = 6 + Math.random() * 10;
    }
  }

  resetLoop() {
    this.pos.copy(this.home);
    this.yaw = this.def.rot || 0;
    this.drift = 0;
    this.mutterIn = 3 + Math.random() * 12;
    if (this.headM) this.headM.rotation.y = 0;
  }
}

export function spawnEchoes(scene, audio) {
  return ECHOES.map(d => new Echo(d, scene, audio));
}
