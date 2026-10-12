/**
 * level.js — turn the station into a scene, then sort it by name prefix.
 *
 * The design doc's contract: one walk of the scene graph wires everything up by
 * prefix, so the level can change without the code changing.
 *
 *   col_      invisible-to-gameplay collision (and most solid props)
 *   nav_      walkable floor
 *   hide_     a hiding spot
 *   int_      an interactable
 *   spawn_*   player / attendant start
 *   patrol_NN the attendant's route, in order
 *   light_    becomes a flickering fluorescent in code
 *
 * If public/models/station.glb exists it is loaded and walked instead, so a real
 * Blender export drops straight in. Otherwise the station is built from
 * station.js, which emits objects with exactly those names.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import { ROOMS, DOORS, PROPS, PATROL, SPAWN_ATTENDANT } from './station.js';

const WALL_T = 0.25;          // wall thickness
const DOOR_H = 2.4;           // head height of a normal opening
const EPS = 0.01;

// ── materials ────────────────────────────────────────────────────────────────

function lam(map, opts = {}) {
  return new THREE.MeshLambertMaterial({ map, ...opts });
}
function flat(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, ...opts });
}

function floorMat(kind, w, d) {
  const tex = { terrazzo: T.terrazzo, concrete: T.concrete, checker: T.checker,
                tile: T.tile, asphalt: T.asphalt, wood: T.wood }[kind] || T.concrete;
  const m = lam(tex().clone());
  m.map.repeat.set(w / 4, d / 4);
  m.map.needsUpdate = true;
  return m;
}

// ── small geometry helpers ───────────────────────────────────────────────────

function box(w, h, d, mat, name, collide = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.name = name || '';
  m.userData.collide = collide;
  return m;
}

/** a wall slab centred on (x,z), spanning `len` along `axis`, from y0 up to y1 */
function wallSlab(axis, at, from, to, y0, y1, mat, name) {
  const len = to - from;
  if (len <= EPS || y1 - y0 <= EPS) return null;
  const w = axis === 'x' ? WALL_T : len;
  const d = axis === 'x' ? len : WALL_T;
  const m = box(w, y1 - y0, d, mat, name);
  const mid = (from + to) / 2;
  m.position.set(axis === 'x' ? at : mid, (y0 + y1) / 2, axis === 'x' ? mid : at);
  // tile the wall texture to its real size
  if (m.material.map) {
    m.material = m.material.clone();
    m.material.map = m.material.map.clone();
    m.material.map.repeat.set(len / 3, (y1 - y0) / 3);
    m.material.map.needsUpdate = true;
  }
  return m;
}

/** subtract [a,b] intervals from a span, returns the remaining intervals */
function subtract(span, cuts) {
  let parts = [span];
  for (const c of cuts) {
    const next = [];
    for (const p of parts) {
      if (c[1] <= p[0] + EPS || c[0] >= p[1] - EPS) { next.push(p); continue; }
      if (c[0] > p[0] + EPS) next.push([p[0], c[0]]);
      if (c[1] < p[1] - EPS) next.push([c[1], p[1]]);
    }
    parts = next;
  }
  return parts;
}

// ── prop builders ────────────────────────────────────────────────────────────

const PROP = {
  empty: () => new THREE.Object3D(),

  bench: () => {
    const g = new THREE.Group();
    const seat = box(4.4, 0.1, 0.62, lam(T.vinyl()), 'col_bench_seat');
    seat.position.y = 0.46;
    const back = box(4.4, 0.52, 0.09, lam(T.vinyl()), 'col_bench_back');
    back.position.set(0, 0.74, -0.28);
    g.add(seat, back);
    for (const x of [-1.9, 0, 1.9]) {
      const leg = box(0.1, 0.44, 0.5, lam(T.metal()), 'col_bench_leg');
      leg.position.set(x, 0.22, 0); g.add(leg);
    }
    return g;
  },

  pillar: () => {
    const m = box(0.8, 7, 0.8, lam(T.wall()), 'col_pillar_body');
    m.position.y = 3.5;
    const g = new THREE.Group(); g.add(m); return g;
  },

  counter: () => {
    const g = new THREE.Group();
    const top = box(4.6, 0.12, 1.1, lam(T.panel()), 'col_counter_top');
    top.position.y = 1.0;
    const body = box(4.4, 1.0, 0.9, lam(T.panel()), 'col_counter_body');
    body.position.y = 0.5;
    g.add(top, body); return g;
  },

  machine: () => { // the ticket machine
    const g = new THREE.Group();
    const body = box(1.0, 1.9, 0.7, lam(T.metal()), 'col_machine_body');
    body.position.y = 0.95; g.add(body);
    const face = box(0.86, 0.6, 0.04, flat(0x1b2416), '', false);
    face.position.set(0, 1.42, 0.37); g.add(face);
    const scr = box(0.5, 0.26, 0.02, flat(0x6f8f3e), '', false);
    scr.position.set(0, 1.46, 0.4); scr.userData.screen = true; g.add(scr);
    const slot = box(0.2, 0.03, 0.03, flat(0x05060a), '', false);
    slot.position.set(0.24, 1.14, 0.38); g.add(slot);
    const tray = box(0.42, 0.04, 0.16, lam(T.metal()), '', false);
    tray.position.set(0, 0.84, 0.4); g.add(tray);
    return g;
  },

  vending: () => {
    const g = new THREE.Group();
    const body = box(1.1, 2.0, 0.78, lam(T.metal()), 'col_vending_body');
    body.position.y = 1.0; g.add(body);
    const glass = box(0.84, 1.3, 0.04, flat(0x16311b, { transparent: true, opacity: 0.55 }), '', false);
    glass.position.set(-0.08, 1.2, 0.41); g.add(glass);
    const lit = box(0.9, 1.36, 0.02, flat(0x2f6a33), '', false);
    lit.position.set(-0.08, 1.2, 0.38); lit.userData.glow = true; g.add(lit);
    return g;
  },

  jukebox: () => {
    const g = new THREE.Group();
    const body = box(0.9, 1.5, 0.6, lam(T.panel()), 'col_jukebox_body');
    body.position.y = 0.75; g.add(body);
    const dome = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.5, 8, 1, false, 0, Math.PI),
      flat(0x7a2d1c));
    dome.rotation.set(Math.PI / 2, 0, 0); dome.position.set(0, 1.5, 0);
    dome.userData.glow = true; g.add(dome);
    return g;
  },

  jukeboxGlow: null,

  pot: () => {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.26, 7), lam(T.metal()));
    p.position.y = 0.13; g.add(p);
    return g;
  },

  stall: () => {
    const g = new THREE.Group();
    const mat = lam(T.metal());
    const back = box(0.06, 2.1, 1.1, mat, 'col_stall_back');
    back.position.set(0.55, 1.05, 0); g.add(back);
    for (const z of [-0.58, 0.58]) {
      const side = box(1.2, 2.1, 0.06, mat, 'col_stall_side');
      side.position.set(0, 1.05, z); g.add(side);
    }
    const door = box(0.05, 1.7, 1.0, mat, 'col_stall_door');
    door.position.set(-0.55, 1.1, 0.0); door.userData.stallDoor = true; g.add(door);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.42, 7), lam(T.tile()));
    bowl.position.set(0.3, 0.21, 0); g.add(bowl);
    return g;
  },

  sinks: () => {
    const g = new THREE.Group();
    const slab = box(3.4, 0.14, 0.56, lam(T.walltile()), 'col_sink_slab');
    slab.position.y = 0.88; g.add(slab);
    for (const x of [-1.1, 0, 1.1]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.16, 8), lam(T.tile()));
      b.position.set(x, 0.86, 0); g.add(b);
      const tap = box(0.04, 0.2, 0.04, lam(T.metal()), '', false);
      tap.position.set(x, 1.04, -0.2); g.add(tap);
    }
    return g;
  },

  mirror: () => {
    const g = new THREE.Group();
    const frame = box(3.4, 1.5, 0.06, lam(T.metal()), '', false);
    g.add(frame);
    const glass = box(3.2, 1.34, 0.02, flat(0x202a2c), '', false);
    glass.position.z = 0.05; glass.userData.mirror = true; g.add(glass);
    return g;
  },

  locker: () => {
    const g = new THREE.Group();
    const body = box(0.7, 1.9, 1.0, lam(T.metal()), 'col_locker_body');
    body.position.y = 0.95; g.add(body);
    const door = box(0.04, 1.8, 0.92, lam(T.metal()), '', false);
    door.position.set(-0.36, 0.95, 0); door.userData.lockerDoor = true; g.add(door);
    const vent = box(0.02, 0.26, 0.5, flat(0x0b0d0a), '', false);
    vent.position.set(-0.39, 1.5, 0); g.add(vent);
    return g;
  },

  conveyor: () => {
    const g = new THREE.Group();
    const belt = box(9, 0.3, 1.6, lam(T.metal()), 'col_conveyor_belt');
    belt.position.y = 0.76; belt.userData.belt = true; g.add(belt);
    const base = box(8.6, 0.62, 1.2, lam(T.metal()), 'col_conveyor_base');
    base.position.y = 0.31; g.add(base);
    const hood = box(2.2, 1.8, 2.0, lam(T.metal()), 'col_conveyor_hood');
    hood.position.set(4.6, 1.5, 0); g.add(hood);
    return g;
  },

  shelf: () => {
    const g = new THREE.Group();
    const mat = lam(T.metal());
    const up = box(0.08, 2.1, 1.0, mat, 'col_shelf_up');
    for (const z of [-0.95, 0.95]) { const u = up.clone(); u.position.set(0, 1.05, z); g.add(u); }
    for (let i = 0; i < 4; i++) {
      const s = box(0.9, 0.05, 2.0, mat, 'col_shelf_board');
      s.position.set(0, 0.45 + i * 0.52, 0); g.add(s);
    }
    // the passengers' things
    const junk = lam(T.vinyl());
    for (let i = 0; i < 7; i++) {
      const b = box(0.2 + Math.random() * 0.26, 0.16 + Math.random() * 0.2,
                    0.2 + Math.random() * 0.3, junk, '', false);
      b.position.set((Math.random() - 0.5) * 0.4,
                     0.56 + ((Math.random() * 3) | 0) * 0.52,
                     (Math.random() - 0.5) * 1.6);
      g.add(b);
    }
    return g;
  },

  board: () => {
    const g = new THREE.Group();
    const frame = box(6.2, 2.6, 0.22, lam(T.metal()), '', false);
    g.add(frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(5.9, 2.35), flat(0x07080a));
    face.position.z = 0.13; face.userData.boardFace = true; g.add(face);
    return g;
  },

  clock: () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 12), lam(T.metal()));
    body.rotation.x = Math.PI / 2; g.add(body);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.54, 14), flat(0xcdd0bd));
    face.position.z = 0.08; g.add(face);
    const hour = box(0.05, 0.3, 0.012, flat(0x11130f), '', false);
    hour.position.set(0, 0.13, 0.1); hour.geometry.translate(0, -0.15, 0);
    hour.position.y = 0.0; hour.userData.hourHand = true; g.add(hour);
    const min = box(0.035, 0.46, 0.012, flat(0x11130f), '', false);
    min.geometry.translate(0, -0.23, 0); min.position.set(0, 0, 0.11);
    min.userData.minHand = true; g.add(min);
    return g;
  },

  sign: () => {
    const g = new THREE.Group();
    const back = box(1.0, 1.28, 0.05, lam(T.metal()), '', false); g.add(back);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 1.2), flat(0xc9c8b4));
    face.position.z = 0.032; face.userData.signFace = true; g.add(face);
    return g;
  },

  note: () => {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), flat(0xb9b49b));
    p.rotation.x = -Math.PI / 2; p.userData.noteFace = true; g.add(p);
    return g;
  },

  book: () => {
    const g = new THREE.Group();
    const b = box(0.4, 0.07, 0.3, lam(T.panel()), '', false); g.add(b);
    const pg = box(0.36, 0.02, 0.26, flat(0xb4b39c), '', false);
    pg.position.y = 0.045; g.add(pg);
    return g;
  },

  drawer: () => {
    const g = new THREE.Group();
    const d = box(0.6, 0.22, 0.5, lam(T.panel()), '', false); g.add(d);
    const pull = box(0.18, 0.04, 0.03, lam(T.metal()), '', false);
    pull.position.set(0, 0, 0.26); g.add(pull);
    return g;
  },

  monitors: () => {
    const g = new THREE.Group();
    const hull = box(0.5, 1.2, 1.6, lam(T.metal()), 'col_monitor_hull'); g.add(hull);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), flat(0x0b1209));
    face.rotation.y = -Math.PI / 2; face.position.x = -0.26;
    face.userData.cctvFace = true; g.add(face);
    return g;
  },

  mic: () => {
    const g = new THREE.Group();
    const base = box(0.16, 0.05, 0.16, lam(T.metal()), '', false); g.add(base);
    const stem = box(0.02, 0.3, 0.02, lam(T.metal()), '', false);
    stem.position.y = 0.17; g.add(stem);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), lam(T.metal()));
    head.position.y = 0.34; g.add(head);
    return g;
  },

  keyring: () => {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 10), flat(0xa9a284));
    ring.rotation.x = Math.PI / 2; g.add(ring);
    for (let i = 0; i < 4; i++) {
      const k = box(0.015, 0.1, 0.03, flat(0xb8ae8a), '', false);
      k.position.set(Math.cos(i * 1.6) * 0.05, -0.05, Math.sin(i * 1.6) * 0.05);
      k.rotation.z = i * 0.4; g.add(k);
    }
    g.userData.spin = true;
    return g;
  },

  slips: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.07), flat(0xb6ae8e));
      s.rotation.set(-Math.PI / 2, 0, i * 0.3);
      s.position.set((i - 2) * 0.05, i * 0.004, (i % 2) * 0.04);
      g.add(s);
    }
    return g;
  },

  panel: () => {
    const g = new THREE.Group();
    const p = box(0.06, 0.4, 0.34, lam(T.metal()), '', false); g.add(p);
    const kp = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.3), flat(0x1d2318));
    kp.rotation.y = -Math.PI / 2; kp.position.x = -0.04;
    kp.userData.keypad = true; g.add(kp);
    return g;
  },

  bin: () => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.9, 8), lam(T.metal()));
    b.position.y = 0.45; b.name = 'col_bin'; b.userData.collide = true; g.add(b);
    return g;
  },

  coin: () => {
    const g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.004, 9), flat(0xb9a86a));
    c.rotation.x = Math.PI / 2; g.add(c);
    g.userData.spin = true;
    return g;
  },

  shelter: () => {
    const g = new THREE.Group();
    const roof = box(7, 0.2, 3.4, lam(T.metal()), 'col_shelter_roof');
    roof.position.y = 3.0; g.add(roof);
    for (const x of [-3.2, 3.2]) {
      const p = box(0.18, 3.0, 0.18, lam(T.metal()), 'col_shelter_post');
      p.position.set(x, 1.5, 1.5); g.add(p);
      const q = p.clone(); q.position.z = -1.5; g.add(q);
    }
    const bench = box(5.4, 0.1, 0.5, lam(T.metal()), 'col_shelter_bench');
    bench.position.set(0, 0.46, -1.2); g.add(bench);
    return g;
  },

  bus: () => {
    const g = new THREE.Group();
    const body = box(11, 2.5, 2.7, lam(T.metal()), 'col_bus_body');
    body.position.y = 1.55; g.add(body);
    const roof = box(11, 0.3, 2.5, lam(T.metal()), 'col_bus_roof');
    roof.position.y = 2.9; g.add(roof);
    // the lit strip of windows — the only warm thing on the platform
    const win = box(10.2, 0.85, 0.04, flat(0x2a3a22), '', false);
    win.position.set(0, 2.1, 1.37); g.add(win);
    const win2 = win.clone(); win2.position.z = -1.37; g.add(win2);
    const dest = box(1.9, 0.3, 0.04, flat(0x9fd356), '', false);
    dest.position.set(-5.4, 2.5, 1.2); dest.userData.busDest = true; g.add(dest);
    for (const x of [-4, 3.6]) {
      const wl = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.34, 9), flat(0x14150f));
      wl.rotation.x = Math.PI / 2; wl.position.set(x, 0.52, 1.38); g.add(wl);
      const wr = wl.clone(); wr.position.z = -1.38; g.add(wr);
    }
    const door = box(0.08, 2.0, 1.0, flat(0x121409), '', false);
    door.position.set(-5.45, 1.3, 0.7); door.userData.busDoor = true; g.add(door);
    return g;
  },
};

// ── the builder ──────────────────────────────────────────────────────────────

export async function buildStation() {
  const group = new THREE.Group();
  group.name = 'station';

  // A real Blender export wins if one is present.
  try {
    const head = await fetch('models/station.glb', { method: 'HEAD' });
    if (head.ok && (head.headers.get('content-type') || '').includes('model')) {
      const gltf = await new GLTFLoader().loadAsync('models/station.glb');
      group.add(gltf.scene);
      return sortByPrefix(group, { fromGLB: true });
    }
  } catch { /* no glb, build from data */ }

  const wallMats = {
    default: lam(T.wall()), wood: lam(T.panel()),
    tile: lam(T.walltile()), asphalt: lam(T.wall()),
  };

  // rooms: floor, ceiling, walls
  const emitted = new Set();
  for (const r of ROOMS) {
    const w = r.x[1] - r.x[0], d = r.z[1] - r.z[0];
    const cx = (r.x[0] + r.x[1]) / 2, cz = (r.z[0] + r.z[1]) / 2;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d, Math.ceil(w / 4), Math.ceil(d / 4)),
                                 floorMat(r.floor, w, d));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.name = `nav_${r.id}`;
    floor.userData.collide = true;
    floor.userData.room = r.id;
    group.add(floor);

    if (!r.outdoor) {
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), (() => {
        const m = lam(T.ceilingTile().clone());
        m.map.repeat.set(w / 2, d / 2); m.map.needsUpdate = true; return m;
      })());
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(cx, r.h, cz);
      ceil.name = `col_ceiling_${r.id}`;
      ceil.userData.collide = true;
      group.add(ceil);
    }

    const wm = wallMats[r.floor === 'wood' ? 'wood' : r.floor === 'tile' ? 'tile' : 'default'];
    const edges = [
      { axis: 'x', at: r.x[0], span: [r.z[0], r.z[1]] },
      { axis: 'x', at: r.x[1], span: [r.z[0], r.z[1]] },
      { axis: 'z', at: r.z[0], span: [r.x[0], r.x[1]] },
      { axis: 'z', at: r.z[1], span: [r.x[0], r.x[1]] },
    ];
    for (const e of edges) {
      const key = `${e.axis}|${e.at}|${e.span[0]}|${e.span[1]}`;
      if (emitted.has(key)) continue;
      emitted.add(key);

      const cuts = DOORS.filter(dr => dr.axis === e.axis && Math.abs(dr.at - e.at) < EPS)
                        .map(dr => [dr.from, dr.to]);
      for (const [a, b] of subtract(e.span, cuts)) {
        const m = wallSlab(e.axis, e.at, a, b, 0, r.h, wm, `col_wall_${r.id}`);
        if (m) group.add(m);
      }
      // lintel over any short opening
      for (const dr of DOORS.filter(x => x.axis === e.axis && Math.abs(x.at - e.at) < EPS && !x.tall)) {
        const m = wallSlab(e.axis, e.at, dr.from, dr.to, DOOR_H, r.h, wm, `col_lintel_${dr.id}`);
        if (m) group.add(m);
        const jamb = box(e.axis === 'x' ? WALL_T + 0.04 : dr.to - dr.from + 0.1, 0.1,
                         e.axis === 'x' ? dr.to - dr.from + 0.1 : WALL_T + 0.04,
                         lam(T.metal()), '', false);
        jamb.position.set(e.axis === 'x' ? e.at : (dr.from + dr.to) / 2, DOOR_H,
                          e.axis === 'x' ? (dr.from + dr.to) / 2 : e.at);
        group.add(jamb);
      }
    }
  }

  // props
  for (const p of PROPS) {
    const maker = PROP[p.kind] || PROP.empty;
    const o = maker();
    o.name = p.name;
    o.position.set(p.pos[0], p.pos[1], p.pos[2]);
    if (p.rot) o.rotation.y = p.rot;
    o.userData.def = p;
    group.add(o);
  }

  // patrol route and attendant spawn as empties, exactly as Blender would hold them
  for (const p of PATROL) {
    const o = new THREE.Object3D();
    o.name = p.name;
    o.position.set(p.pos[0], p.pos[1], p.pos[2]);
    group.add(o);
  }
  const sa = new THREE.Object3D();
  sa.name = 'spawn_attendant';
  sa.position.set(...SPAWN_ATTENDANT);
  group.add(sa);

  return sortByPrefix(group, { fromGLB: false });
}

// ── the one walk of the scene graph ──────────────────────────────────────────

function sortByPrefix(group, { fromGLB }) {
  const out = {
    group,
    collide: [],        // meshes that stop the player
    nav: [],            // walkable floors
    hides: [],          // hiding spots
    interactables: [],  // int_ objects
    lights: [],         // light_ empties
    patrol: [],
    spawnPlayer: new THREE.Vector3(0, 0, 6),
    spawnPlayerRot: Math.PI,
    spawnAttendant: new THREE.Vector3(...SPAWN_ATTENDANT),
    byName: new Map(),
  };

  group.updateMatrixWorld(true);

  group.traverse(o => {
    if (o.name) out.byName.set(o.name, o);
    const n = o.name || '';

    if (n.startsWith('spawn_player')) {
      o.getWorldPosition(out.spawnPlayer);
      out.spawnPlayerRot = o.rotation.y;
    } else if (n.startsWith('spawn_attendant')) {
      o.getWorldPosition(out.spawnAttendant);
    } else if (n.startsWith('patrol_')) {
      const v = new THREE.Vector3(); o.getWorldPosition(v);
      out.patrol.push({ name: n, pos: v });
    } else if (n.startsWith('light_')) {
      const v = new THREE.Vector3(); o.getWorldPosition(v);
      out.lights.push({ name: n, pos: v, def: o.userData.def || {} });
    } else if (n.startsWith('hide_')) {
      const v = new THREE.Vector3(); o.getWorldPosition(v);
      out.hides.push({ name: n, obj: o, pos: v, kind: hideKind(n), def: o.userData.def || {} });
    } else if (n.startsWith('int_')) {
      const v = new THREE.Vector3(); o.getWorldPosition(v);
      out.interactables.push({ name: n, obj: o, pos: v, def: o.userData.def || {} });
    }

    if (o.isMesh) {
      if (n.startsWith('nav_')) out.nav.push(o);
      // from a glb, col_ meshes are invisible collision; built here, props are solid too
      if (n.startsWith('col_') && fromGLB) o.visible = false;
      if (o.userData.collide || n.startsWith('col_') || n.startsWith('nav_')) out.collide.push(o);
      o.castShadow = false; o.receiveShadow = false;
    }
  });

  out.patrol.sort((a, b) => a.name.localeCompare(b.name));

  // hide spots sit inside the prop that holds them; give each a stand point
  for (const h of out.hides) {
    h.stand = standPoint(h);
  }

  out.collider = mergeColliders(out.collide);
  return out;
}

function hideKind(name) {
  if (name.includes('bench')) return 'bench';
  if (name.includes('stall')) return 'stall';
  if (name.includes('locker')) return 'locker';
  if (name.includes('conveyor')) return 'conveyor';
  return 'other';
}

/** where the camera goes while hiding in this spot, and which way it faces */
function standPoint(h) {
  const p = h.pos.clone();
  const yaw = h.obj.rotation.y || 0;
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  switch (h.kind) {
    case 'bench':   return { pos: p.clone().add(new THREE.Vector3(0, 0.45, 0)), yaw, crouch: true };
    case 'stall':   return { pos: p.clone().add(fwd.clone().multiplyScalar(0.3)).setY(1.35), yaw: yaw + Math.PI, crouch: false };
    case 'locker':  return { pos: p.clone().add(fwd.clone().multiplyScalar(-0.1)).setY(1.35), yaw: yaw + Math.PI, crouch: false };
    default:        return { pos: p.clone().setY(0.9), yaw, crouch: true };
  }
}

function mergeColliders(meshes) {
  const geos = [];
  for (const m of meshes) {
    const g = m.geometry.clone();
    g.deleteAttribute('uv');
    g.deleteAttribute('uv1');
    g.deleteAttribute('color');
    if (!g.attributes.normal) g.computeVertexNormals();
    m.updateWorldMatrix(true, false);
    g.applyMatrix4(m.matrixWorld);
    geos.push(g);
  }
  if (!geos.length) return new THREE.BufferGeometry();
  const merged = BGU.mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged;
}
