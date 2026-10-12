/**
 * player.js — first person controls, and everything the station can hear you do.
 *
 * Mouse look is handled directly off the Pointer Lock API rather than through
 * PointerLockControls, because the camera rig needs head bob, crouch, lean,
 * hide-spot possession and fear shake layered on top of the look angles.
 *
 * Noise is the important output: every step, every sprint, every knocked bin
 * emits a noise event with a loudness and a position, and the Attendant hears it.
 */
import * as THREE from 'three';

const STAND = 1.72;
const CROUCH = 1.02;
const RADIUS = 0.32;
const GRAVITY = 24;

export const SPEED = { walk: 2.45, run: 4.7, crouch: 1.12, hidden: 0 };

export class Player {
  constructor(camera, collider, opts = {}) {
    this.camera = camera;
    this.collider = collider;

    this.pos = new THREE.Vector3(0, 0, 6);     // feet
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.pitch = 0;
    this.height = STAND;
    this.eye = STAND;
    this.grounded = false;

    this.crouching = false;
    this.running = false;
    this.moving = false;
    this.speed = 0;

    // breath, used while hiding
    this.breath = 1;
    this.holding = false;
    this.gasped = false;

    // flashlight
    this.flashlight = null;
    this.flashOn = false;
    this.battery = 1;
    this.hasFlashlight = false;

    // hiding
    this.hiding = null;
    this.hideBlend = 0;

    // look feel
    this.sens = opts.sens ?? 0.0022;
    this.invertY = !!opts.invertY;

    this.bob = 0;
    this.bobAmt = 0;
    this.shake = 0;
    this.lean = 0;
    this.fear = 0;

    this.keys = Object.create(null);
    this._noiseCb = opts.onNoise || (() => {});
    this._stepCb = opts.onStep || (() => {});
    this._stepDist = 0;
    this._locked = false;

    this._bindInput();
    this._makeFlashlight();
  }

  // ── input ─────────────────────────────────────────────────────────────────

  _bindInput() {
    const SWALLOW = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Tab', 'Slash', 'Quote']);
    this._onKeyDown = e => {
      // these would otherwise scroll or quick-find in the page hosting the game
      if (SWALLOW.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
    };
    this._onKeyUp = e => { this.keys[e.code] = false; };
    // Pointer lock is refused in a lot of embedded contexts, so dragging with
    // the left button held is always available as a fallback. Without it the
    // game is unplayable anywhere the lock is blocked.
    this._onMove = e => {
      const dragging = this._dragging && !this._locked;
      if (!this._locked && !dragging) return;
      const k = dragging ? this.sens * 1.35 : this.sens;
      this.yaw -= e.movementX * k;
      this.pitch += (this.invertY ? 1 : -1) * e.movementY * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    };
    this._onDown = e => { if (e.button === 0) this._dragging = true; };
    this._onUp = e => { if (e.button === 0) this._dragging = false; };
    this._onLockChange = () => {
      this._locked = document.pointerLockElement != null;
      if (this._locked) { this._everLocked = true; this._dragging = false; }
      else this.keys = Object.create(null);
    };

    addEventListener('keydown', this._onKeyDown);
    addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMove);
    document.addEventListener('mousedown', this._onDown);
    addEventListener('mouseup', this._onUp);
    addEventListener('blur', this._onUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  /** true once a lock request has actually been granted at least once */
  get lockWorks() { return this._everLocked === true; }

  /**
   * Pointer lock rejects (and in newer Chrome, throws an unhandled rejection) if
   * it is already held, so guard it and swallow a refusal.
   */
  requestLock(el) {
    if (!el || document.pointerLockElement === el) return;
    try {
      const p = el.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* the browser declined; the pause overlay covers it */ }
  }
  get locked() { return this._locked; }

  dispose() {
    removeEventListener('keydown', this._onKeyDown);
    removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('mousedown', this._onDown);
    removeEventListener('mouseup', this._onUp);
    removeEventListener('blur', this._onUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }

  // ── flashlight ────────────────────────────────────────────────────────────

  _makeFlashlight() {
    const s = new THREE.SpotLight(0xf2ead4, 0, 30, 0.40, 0.72, 1.6);
    s.position.set(0.16, -0.1, 0.1);
    const t = new THREE.Object3D();
    t.position.set(0.16, -0.1, -1);
    s.target = t;
    this.flashlight = s;
    this.flashTarget = t;
    this.camera.add(s, t);
  }

  toggleFlashlight() {
    if (!this.hasFlashlight || this.battery <= 0) return false;
    this.flashOn = !this.flashOn;
    return this.flashOn;
  }

  /** is `point` inside the lit cone? the Attendant notices the beam */
  beamHits(point) {
    if (!this.flashOn || this.battery <= 0) return false;
    const eye = this.eyePosition();
    const to = point.clone().sub(eye);
    const d = to.length();
    if (d > 22) return false;
    to.normalize();
    const fwd = this.forward();
    return fwd.dot(to) > Math.cos(0.5);
  }

  // ── geometry helpers ──────────────────────────────────────────────────────

  eyePosition(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.eye, this.pos.z);
  }
  forward(out = new THREE.Vector3()) {
    return out.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();
  }

  teleport(pos, yaw = this.yaw) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.hiding = null; this.hideBlend = 0;
    this.breath = 1; this.holding = false;
    this.crouching = false;
  }

  // ── hiding ────────────────────────────────────────────────────────────────

  enterHide(spot) {
    this.hiding = spot;
    this.vel.set(0, 0, 0);
    this.breath = Math.max(this.breath, 0.75);
  }
  exitHide() {
    if (!this.hiding) return;
    const s = this.hiding.stand;
    this.pos.set(s.pos.x, 0, s.pos.z);
    // step out of the furniture
    this.pos.x += Math.sin(this.yaw) * 0.8;
    this.pos.z += Math.cos(this.yaw) * 0.8;
    this.hiding = null;
  }

  // ── update ────────────────────────────────────────────────────────────────

  update(dt, { canMove = true, noiseScale = 1 } = {}) {
    // --- crouch / stance ---
    const wantCrouch = !!(this.keys.ControlLeft || this.keys.ControlRight || this.keys.KeyC);
    this.crouching = canMove && wantCrouch && !this.hiding;
    const targetH = this.crouching ? CROUCH : STAND;
    this.height = THREE.MathUtils.damp(this.height, targetH, 12, dt);

    // --- hiding: possession of the spot, no movement ---
    if (this.hiding) {
      this.hideBlend = Math.min(1, this.hideBlend + dt * 5);
      const s = this.hiding.stand;
      this.pos.lerp(new THREE.Vector3(s.pos.x, 0, s.pos.z), 1 - Math.pow(0.001, dt));
      this.eye = THREE.MathUtils.damp(this.eye, s.pos.y, 9, dt);
      this._updateBreath(dt);
      this._applyCamera(dt);
      this.moving = false; this.speed = 0;
      return;
    }
    this.hideBlend = Math.max(0, this.hideBlend - dt * 5);

    // --- movement ---
    let ix = 0, iz = 0;
    if (canMove) {
      if (this.keys.KeyW || this.keys.ArrowUp) iz -= 1;
      if (this.keys.KeyS || this.keys.ArrowDown) iz += 1;
      if (this.keys.KeyA || this.keys.ArrowLeft) ix -= 1;
      if (this.keys.KeyD || this.keys.ArrowRight) ix += 1;
    }
    const mag = Math.hypot(ix, iz);
    this.moving = mag > 0;
    this.running = canMove && this.moving && !this.crouching &&
                   !!(this.keys.ShiftLeft || this.keys.ShiftRight);

    const target = this.crouching ? SPEED.crouch : this.running ? SPEED.run : SPEED.walk;

    let wish = new THREE.Vector3();
    if (mag > 0) {
      ix /= mag; iz /= mag;
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      wish.addScaledVector(fwd, -iz).addScaledVector(right, ix).normalize().multiplyScalar(target);
    }

    // ground friction / air control
    const accel = this.grounded ? 14 : 3;
    this.vel.x = THREE.MathUtils.damp(this.vel.x, wish.x, accel, dt);
    this.vel.z = THREE.MathUtils.damp(this.vel.z, wish.z, accel, dt);
    this.vel.y -= GRAVITY * dt;

    const step = this.vel.clone().multiplyScalar(dt);
    this.pos.add(step);

    const r = this.collider.resolve(this.pos, this.height, RADIUS);
    this.grounded = r.grounded;
    if (r.grounded) this.vel.y = Math.max(0, this.vel.y);
    if (r.hitWall) { this.vel.x *= 0.25; this.vel.z *= 0.25; }

    // don't fall out of the world
    if (this.pos.y < -6) this.pos.set(0, 0.2, 6);

    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // --- footsteps and noise ---
    if (this.grounded && this.speed > 0.35) {
      const stride = this.crouching ? 1.15 : this.running ? 0.78 : 0.95;
      this._stepDist += this.speed * dt;
      if (this._stepDist >= stride) {
        this._stepDist = 0;
        const loud = (this.crouching ? 0.1 : this.running ? 1.0 : 0.42) * noiseScale;
        this._stepCb(loud, this.pos.clone());
        this._noiseCb({ pos: this.pos.clone(), loud, kind: 'step' });
      }
    } else {
      this._stepDist = Math.min(this._stepDist, 0.6);
    }

    // --- breath, bob, flashlight ---
    this._updateBreath(dt);

    this.bobAmt = THREE.MathUtils.damp(this.bobAmt, Math.min(1, this.speed / SPEED.walk), 8, dt);
    this.bob += this.speed * dt * (this.running ? 9.5 : 7.2);

    if (this.flashOn) {
      this.battery = Math.max(0, this.battery - dt * 0.0077);  // ~2min of light
      if (this.battery <= 0) this.flashOn = false;
    }
    const want = this.flashOn ? THREE.MathUtils.lerp(14, 95, Math.min(1, this.battery * 3)) : 0;
    this.flashlight.intensity = THREE.MathUtils.damp(this.flashlight.intensity, want, 10, dt);
    // a dying bulb flickers
    if (this.flashOn && this.battery < 0.22 && Math.random() < 0.06) {
      this.flashlight.intensity *= 0.25;
    }

    this.eye = THREE.MathUtils.damp(this.eye, this.height - 0.12, 11, dt);
    this._applyCamera(dt);
  }

  _updateBreath(dt) {
    const holdKey = !!this.keys.Space;
    this.holding = holdKey && !!this.hiding;
    if (this.holding) {
      this.breath = Math.max(0, this.breath - dt * 0.31);        // ~3.2s of held breath
      if (this.breath <= 0 && !this.gasped) {
        this.gasped = true;
        this._noiseCb({ pos: this.pos.clone(), loud: 0.85, kind: 'gasp' });
      }
    } else {
      this.breath = Math.min(1, this.breath + dt * 0.23);
      if (this.breath > 0.3) this.gasped = false;
    }
  }

  _applyCamera(dt) {
    const c = this.camera;

    // bob
    const b = this.bobAmt;
    const bobY = Math.sin(this.bob) * 0.038 * b;
    const bobX = Math.cos(this.bob * 0.5) * 0.028 * b;

    // fear shake, and a lean when hiding
    this.shake = THREE.MathUtils.damp(this.shake, this.fear, 4, dt);
    const sh = this.shake;
    const shX = (Math.random() - 0.5) * 0.012 * sh;
    const shY = (Math.random() - 0.5) * 0.012 * sh;

    let yaw = this.yaw, pitch = this.pitch;
    if (this.hiding) {
      // looking out through a gap: the view is clamped to the hiding spot's facing
      const f = this.hiding.stand.yaw;
      const limit = this.hiding.kind === 'locker' ? 0.42
                  : this.hiding.kind === 'stall'  ? 0.85 : 1.1;
      let d = ((this.yaw - f + Math.PI) % (Math.PI * 2)) - Math.PI;
      d = THREE.MathUtils.clamp(d, -limit, limit);
      this.yaw = f + d;
      yaw = this.yaw;
      pitch = THREE.MathUtils.clamp(this.pitch, -0.6, 0.6);
    }

    c.position.set(this.pos.x + bobX, this.pos.y + this.eye + bobY, this.pos.z);
    c.rotation.set(0, 0, 0);
    c.rotateY(yaw + shX);
    c.rotateX(pitch + shY);
    // a slight roll into the strafe
    const roll = THREE.MathUtils.clamp(-this.vel.dot(
      new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))) * 0.006, -0.05, 0.05);
    c.rotateZ(roll + (Math.random() - 0.5) * 0.004 * sh);
  }

  /** how loud the player is right now, for the Attendant's hearing */
  noiseLevel() {
    if (this.hiding) return this.holding ? 0.0 : 0.08;
    if (!this.moving || !this.grounded) return 0.02;
    return this.crouching ? 0.08 : this.running ? 0.9 : 0.35;
  }
}
