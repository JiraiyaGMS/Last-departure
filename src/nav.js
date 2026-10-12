/**
 * nav.js — a walkable grid and A* over it.
 *
 * The doc specifies recast-navigation-js building a navmesh from the nav_ meshes
 * of station.glb. Without the Blender export there are no nav_ surfaces to voxelise,
 * so the walkable area is rasterised from the room rectangles and the door openings
 * instead and searched with A*. The Attendant still walks real routes through real
 * doorways; swapping in recast later only changes `path()`.
 */
import * as THREE from 'three';
import { ROOMS, DOORS } from './station.js';

const CELL = 0.5;
const INSET = 0.45;   // keep away from walls
const PAD = 0.55;     // clearance around solid props

export class NavGrid {
  constructor(blockers = []) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const r of ROOMS) {
      minX = Math.min(minX, r.x[0]); maxX = Math.max(maxX, r.x[1]);
      minZ = Math.min(minZ, r.z[0]); maxZ = Math.max(maxZ, r.z[1]);
    }
    this.minX = minX - 1; this.minZ = minZ - 1;
    this.w = Math.ceil((maxX - minX + 2) / CELL);
    this.h = Math.ceil((maxZ - minZ + 2) / CELL);
    this.open = new Uint8Array(this.w * this.h);

    // room interiors, inset from the walls
    for (const r of ROOMS) {
      this.fillRect(r.x[0] + INSET, r.z[0] + INSET, r.x[1] - INSET, r.z[1] - INSET, 1);
    }
    // carve the doorways back open, both sides of the wall
    for (const d of DOORS) {
      if (d.front) continue;        // the front doors go nowhere
      const m = 0.9;
      if (d.axis === 'x') this.fillRect(d.at - m, d.from + 0.15, d.at + m, d.to - 0.15, 1);
      else                this.fillRect(d.from + 0.15, d.at - m, d.to - 0.15, d.at + m, 1);
    }
    // punch out solid props
    const bb = new THREE.Box3();
    for (const m of blockers) {
      if (!m.isMesh) continue;
      const n = m.name || '';
      if (n.startsWith('nav_') || n.startsWith('col_ceiling') || n.startsWith('col_wall')
          || n.startsWith('col_lintel')) continue;
      bb.setFromObject(m);
      if (bb.max.y < 0.35) continue;          // flat on the floor, walk over it
      this.fillRect(bb.min.x - PAD, bb.min.z - PAD, bb.max.x + PAD, bb.max.z + PAD, 0);
    }
  }

  fillRect(x0, z0, x1, z1, v) {
    const i0 = Math.max(0, Math.floor((x0 - this.minX) / CELL));
    const i1 = Math.min(this.w - 1, Math.ceil((x1 - this.minX) / CELL));
    const j0 = Math.max(0, Math.floor((z0 - this.minZ) / CELL));
    const j1 = Math.min(this.h - 1, Math.ceil((z1 - this.minZ) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.open[j * this.w + i] = v;
  }

  idx(x, z) {
    const i = Math.round((x - this.minX) / CELL);
    const j = Math.round((z - this.minZ) / CELL);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }
  world(k) {
    return new THREE.Vector3((k % this.w) * CELL + this.minX, 0, ((k / this.w) | 0) * CELL + this.minZ);
  }
  isOpen(k) { return k >= 0 && this.open[k] === 1; }

  /** nearest open cell to a point, searched in rings */
  nearest(p) {
    const k = this.idx(p.x, p.z);
    if (this.isOpen(k)) return k;
    const i0 = Math.round((p.x - this.minX) / CELL), j0 = Math.round((p.z - this.minZ) / CELL);
    for (let r = 1; r < 40; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        const kk = j * this.w + i;
        if (this.open[kk] === 1) return kk;
      }
    }
    return -1;
  }

  /** A* with an 8-way neighbourhood; returns world-space waypoints */
  path(from, to) {
    const s = this.nearest(from), g = this.nearest(to);
    if (s < 0 || g < 0) return [];
    if (s === g) return [this.world(g)];

    const n = this.w * this.h;
    const gScore = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    gScore[s] = 0;

    const gi = g % this.w, gj = (g / this.w) | 0;
    const heap = [[this.hEst(s, gi, gj), s]];
    const push = (f, k) => {
      heap.push([f, k]);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heap[p][0] <= heap[c][0]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]]; c = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let p = 0;
        for (;;) {
          const l = p * 2 + 1, r = l + 1; let m = p;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === p) break;
          [heap[m], heap[p]] = [heap[p], heap[m]]; p = m;
        }
      }
      return top;
    };

    let found = false, guard = 0;
    while (heap.length && guard++ < 60000) {
      const [, k] = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === g) { found = true; break; }
      const i = k % this.w, j = (k / this.w) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= this.w || nj >= this.h) continue;
        const nk = nj * this.w + ni;
        if (this.open[nk] !== 1 || closed[nk]) continue;
        // no squeezing through diagonal gaps
        if (di && dj && (this.open[j * this.w + ni] !== 1 || this.open[nj * this.w + i] !== 1)) continue;
        const step = (di && dj) ? 1.4142 : 1;
        const t = gScore[k] + step;
        if (t < gScore[nk]) {
          gScore[nk] = t; came[nk] = k;
          push(t + this.hEst(nk, gi, gj), nk);
        }
      }
    }
    if (!found) return [];

    const cells = [];
    for (let k = g; k !== -1; k = came[k]) cells.push(k);
    cells.reverse();
    return this.smooth(cells);
  }

  hEst(k, gi, gj) {
    const i = k % this.w, j = (k / this.w) | 0;
    const dx = Math.abs(i - gi), dz = Math.abs(j - gj);
    return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz);
  }

  /** drop waypoints we can walk straight past, so he moves like a person */
  smooth(cells) {
    const pts = cells.map(k => this.world(k));
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this.clearLine(pts[anchor], pts[i])) {
        out.push(pts[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  clearLine(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(d / (CELL * 0.6));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (!this.isOpen(this.idx(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t))) return false;
    }
    return true;
  }
}
