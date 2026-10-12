/**
 * lights.js — the fluorescent rig.
 *
 * The doc puts most of the scare in the lighting, so each light_ empty becomes a
 * real tube with a state: healthy, flickering, dying, or dead. Flicker is driven
 * by a per-light noise so no two tubes stutter together, and the whole rig can be
 * dropped on a frame (an event, or the director deciding the room behind you goes
 * dark).
 *
 * The reduced-flashing option limits flicker depth and rate without making the
 * station any brighter — the darkness is the point, the strobing is not.
 */
import * as THREE from 'three';

export class Fluorescent {
  constructor(def, scene) {
    this.def = def.def || {};
    this.name = def.name;
    this.pos = def.pos.clone();

    const sodium = !!this.def.sodium;
    this.baseColor = new THREE.Color(sodium ? 0xffb257 : 0xdce8c8);
    // three.js uses physical light units since r155, so these are candela, not
    // the 0-1 factors the old renderer took. A tube needs to be in the tens to
    // throw a pool of light a few metres across.
    this.baseIntensity = sodium ? 230 : 115;
    this.range = sodium ? 48 : 26;
    this.decay = sodium ? 1.6 : 1.7;

    this.light = new THREE.PointLight(this.baseColor, this.baseIntensity, this.range, this.decay);
    this.light.position.copy(this.pos);
    scene.add(this.light);

    // the tube itself, so you can see which one is failing
    const geo = sodium ? new THREE.BoxGeometry(0.4, 0.2, 0.4)
                       : new THREE.BoxGeometry(2.3, 0.1, 0.22);
    this.mat = new THREE.MeshBasicMaterial({ color: this.baseColor, fog: true });
    this.tube = new THREE.Mesh(geo, this.mat);
    this.tube.position.copy(this.pos);
    this.tube.name = `lightmesh_${def.name}`;
    scene.add(this.tube);

    this.flickerAmt = this.def.flicker ?? 0.08;
    this.dead = false;
    this.level = 1;
    this.seed = Math.random() * 1000;
    this.phase = 0;
    this.strike = 0;
  }

  kill(hard = true) {
    if (this.dead) return false;
    this.dead = true;
    this.level = 0;
    return true;
  }
  revive() { this.dead = false; this.strike = 0.6; }

  /** a one-off stutter, used when something walks past */
  disturb(amount = 1) { this.strike = Math.max(this.strike, 0.35 * amount); }

  update(dt, t, reducedFlash) {
    if (this.dead) {
      this.level = THREE.MathUtils.damp(this.level, 0, 14, dt);
    } else {
      const amt = reducedFlash ? Math.min(this.flickerAmt, 0.12) : this.flickerAmt;
      const rate = reducedFlash ? 2.2 : 7.0;
      // two incommensurate waves plus an occasional dropout: reads as a bad ballast
      const a = Math.sin((t + this.seed) * rate * 1.7);
      const b = Math.sin((t + this.seed) * rate * 0.61 + 1.3);
      let v = 1 - amt * (0.5 + 0.5 * a * b);
      if (!reducedFlash && amt > 0.2 && Math.random() < amt * dt * 7) v *= 0.15;
      if (this.strike > 0) {
        this.strike -= dt;
        v *= (Math.random() < 0.5 ? 0.2 : 1.2);
      }
      this.level = THREE.MathUtils.damp(this.level, v, 24, dt);
    }
    const lv = THREE.MathUtils.clamp(this.level, 0, 1.3);
    this.light.intensity = this.baseIntensity * lv;
    this.mat.color.copy(this.baseColor).multiplyScalar(Math.max(0.03, lv));
  }
}

export class LightRig {
  constructor(lightDefs, scene) {
    this.scene = scene;
    this.lights = lightDefs.map(d => new Fluorescent(d, scene));
    this.byName = new Map(this.lights.map(l => [l.name, l]));
    this.reducedFlash = false;
    this.t = 0;
  }

  get(name) { return this.byName.get(name); }

  /** every light whose name contains `tag` */
  tagged(tag) { return this.lights.filter(l => l.name.includes(tag)); }

  killTagged(tag) {
    let n = 0;
    for (const l of this.tagged(tag)) if (l.kill()) n++;
    return n;
  }

  /** the nearest working light to a point, for "the one behind you goes out" */
  nearestLive(pos, minDist = 0, maxDist = 60) {
    let best = null, bd = Infinity;
    for (const l of this.lights) {
      if (l.dead) continue;
      const d = l.pos.distanceTo(pos);
      if (d < minDist || d > maxDist) continue;
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  reviveAll() { for (const l of this.lights) l.revive(); }

  update(dt) {
    this.t += dt;
    for (const l of this.lights) l.update(dt, this.t, this.reducedFlash);
  }
}
