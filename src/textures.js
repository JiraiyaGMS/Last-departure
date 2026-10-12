/**
 * textures.js — every surface in the station, drawn into small canvases.
 *
 * The art direction asks for low-resolution textures and a PS1 palette: sick
 * fluorescent green, rust orange, deep blue shadow. Nothing here is larger than
 * 128px and everything is NearestFilter, so the upscale stays crunchy.
 */
import * as THREE from 'three';

const cache = new Map();

function make(key, w, h, draw, { repeat = [1, 1], aniso = 1 } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  cache.set(key, t);
  return t;
}

/** deterministic noise so the station looks the same every loop */
let seed = 1987;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function resetSeed(s = 1987) { seed = s; }

function grain(g, w, h, amt, dark = true) {
  for (let i = 0; i < w * h * amt; i++) {
    const x = (rnd() * w) | 0, y = (rnd() * h) | 0;
    g.fillStyle = dark ? `rgba(0,0,0,${0.05 + rnd() * 0.18})`
                       : `rgba(255,255,255,${0.03 + rnd() * 0.08})`;
    g.fillRect(x, y, 1, 1);
  }
}

function stain(g, w, h, n, color) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = 4 + rnd() * 18;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, color); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// ── floors ───────────────────────────────────────────────────────────────────

export const terrazzo = () => make('terrazzo', 64, 64, (g, w, h) => {
  resetSeed(21);
  g.fillStyle = '#4b4a42'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 420; i++) {
    const x = rnd() * w, y = rnd() * h, s = 1 + rnd() * 2.4;
    const p = rnd();
    g.fillStyle = p < 0.35 ? '#6b6a5c' : p < 0.6 ? '#3a3b36' : p < 0.82 ? '#7d7b6a' : '#8a5b3c';
    g.fillRect(x, y, s, s);
  }
  // expansion joints
  g.strokeStyle = 'rgba(14,14,12,.85)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, 0.5); g.lineTo(w, 0.5); g.moveTo(0.5, 0); g.lineTo(0.5, h); g.stroke();
  grain(g, w, h, 0.5);
}, { repeat: [1, 1], aniso: 4 });

export const concrete = () => make('concrete', 64, 64, (g, w, h) => {
  resetSeed(44);
  g.fillStyle = '#3c3d39'; g.fillRect(0, 0, w, h);
  grain(g, w, h, 1.6);
  stain(g, w, h, 6, 'rgba(20,18,14,.5)');
  stain(g, w, h, 3, 'rgba(96,54,26,.22)'); // rust seep
}, { aniso: 4 });

export const checker = () => make('checker', 64, 64, (g, w, h) => {
  resetSeed(9);
  const s = 16;
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
    g.fillStyle = ((x / s + y / s) % 2) ? '#15171a' : '#9a9684';
    g.fillRect(x, y, s, s);
  }
  grain(g, w, h, 0.9);
  stain(g, w, h, 4, 'rgba(70,40,18,.3)');
}, { aniso: 4 });

export const tile = () => make('tile', 64, 64, (g, w, h) => {
  resetSeed(77);
  g.fillStyle = '#6d7468'; g.fillRect(0, 0, w, h);
  const s = 8;
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
    const v = 0.86 + rnd() * 0.28;
    g.fillStyle = `rgb(${(100 * v) | 0},${(108 * v) | 0},${(98 * v) | 0})`;
    g.fillRect(x + 1, y + 1, s - 1, s - 1);
  }
  stain(g, w, h, 7, 'rgba(26,34,22,.55)');
  grain(g, w, h, 0.8);
}, { aniso: 4 });

export const asphalt = () => make('asphalt', 64, 64, (g, w, h) => {
  resetSeed(301);
  g.fillStyle = '#23241f'; g.fillRect(0, 0, w, h);
  grain(g, w, h, 2.4);
  stain(g, w, h, 5, 'rgba(0,0,0,.6)');
}, { aniso: 4 });

export const wood = () => make('wood', 64, 64, (g, w, h) => {
  resetSeed(58);
  g.fillStyle = '#4a3322'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) {
    g.fillStyle = `rgba(${(90 + rnd() * 40) | 0},${(60 + rnd() * 26) | 0},${(34 + rnd() * 18) | 0},.8)`;
    g.fillRect(0, y, w, 7);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, y + 7, w, 1);
  }
  grain(g, w, h, 1.1);
}, { aniso: 4 });

// ── walls ────────────────────────────────────────────────────────────────────

/** painted cinderblock, the station's default wall */
export const wall = () => make('wall', 64, 64, (g, w, h) => {
  resetSeed(103);
  g.fillStyle = '#55584a'; g.fillRect(0, 0, w, h);
  const bh = 8, bw = 16;
  for (let y = 0, r = 0; y < h; y += bh, r++) {
    for (let x = (r % 2) ? -bw / 2 : 0; x < w; x += bw) {
      const v = 0.9 + rnd() * 0.22;
      g.fillStyle = `rgb(${(88 * v) | 0},${(92 * v) | 0},${(76 * v) | 0})`;
      g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
  }
  stain(g, w, h, 8, 'rgba(18,22,16,.5)');
  stain(g, w, h, 3, 'rgba(110,56,24,.25)');
  grain(g, w, h, 0.7);
}, { aniso: 4 });

/** wood panelling, 1987 — ticket office and manager's office */
export const panel = () => make('panel', 64, 64, (g, w, h) => {
  resetSeed(140);
  g.fillStyle = '#3d2a1b'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 10) {
    const v = 0.85 + rnd() * 0.3;
    g.fillStyle = `rgb(${(84 * v) | 0},${(56 * v) | 0},${(32 * v) | 0})`;
    g.fillRect(x, 0, 9, h);
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x + 9, 0, 1, h);
  }
  grain(g, w, h, 1.0);
}, { aniso: 4 });

/** restroom tiling, waist high */
export const walltile = () => make('walltile', 64, 64, (g, w, h) => {
  resetSeed(166);
  g.fillStyle = '#7b8276'; g.fillRect(0, 0, w, h);
  const s = 8;
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
    const v = 0.88 + rnd() * 0.24;
    g.fillStyle = `rgb(${(126 * v) | 0},${(134 * v) | 0},${(120 * v) | 0})`;
    g.fillRect(x + 1, y + 1, s - 1, s - 1);
  }
  stain(g, w, h, 9, 'rgba(24,30,20,.5)');
}, { aniso: 4 });

export const ceilingTile = () => make('ceilingTile', 64, 64, (g, w, h) => {
  resetSeed(188);
  g.fillStyle = '#5f6054'; g.fillRect(0, 0, w, h);
  const s = 32;
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
    g.fillStyle = `rgb(${(104 + rnd() * 16) | 0},${(106 + rnd() * 16) | 0},${(94 + rnd() * 14) | 0})`;
    g.fillRect(x + 1, y + 1, s - 2, s - 2);
    // pinholes
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(x + 2 + rnd() * (s - 4), y + 2 + rnd() * (s - 4), 1, 1);
    }
  }
  stain(g, w, h, 4, 'rgba(84,62,20,.35)'); // water damage
}, { aniso: 2 });

export const metal = () => make('metal', 32, 32, (g, w, h) => {
  resetSeed(222);
  g.fillStyle = '#4e5250'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`;
    g.fillRect(0, y, w, 1);
  }
  stain(g, w, h, 4, 'rgba(104,48,18,.4)');
  grain(g, w, h, 0.6);
});

export const vinyl = () => make('vinyl', 32, 32, (g, w, h) => {
  resetSeed(255);
  g.fillStyle = '#5a3b1f'; g.fillRect(0, 0, w, h);
  grain(g, w, h, 1.2);
  stain(g, w, h, 3, 'rgba(0,0,0,.4)');
});

/** the split-flap departure board face, redrawn as departures change */
export function boardTexture(rows, { glitch = 0 } = {}) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#07080a'; g.fillRect(0, 0, 256, 128);

  g.font = '9px monospace'; g.textBaseline = 'top';
  g.fillStyle = '#93a579';
  g.fillText('DEPARTURES', 7, 5);
  g.fillText('BAY', 150, 5);
  g.fillText('TIME', 183, 5);
  g.fillStyle = '#20251c'; g.fillRect(6, 16, 244, 1);

  rows.forEach((r, i) => {
    const y = 21 + i * 13;
    const cancelled = r.status === 'CANCELLED';
    g.fillStyle = cancelled ? '#d4703f' : r.status === 'BOARDING' ? '#cdfa86' : '#cfe09a';
    g.font = '10px monospace';
    let dest = r.dest;
    if (glitch > 0 && Math.random() < glitch) {
      const k = (Math.random() * dest.length) | 0;
      dest = dest.slice(0, k) + '█' + dest.slice(k + 1);
    }
    g.fillText(dest.slice(0, 18).toUpperCase(), 8, y);
    g.fillText(String(r.bay), 152, y);
    g.fillText(r.time, 183, y);
    if (cancelled) {
      g.fillStyle = '#d4703f'; g.font = '7px monospace';
      g.fillText('CNX', 228, y + 2);
    }
  });

  // flap seams
  g.fillStyle = 'rgba(0,0,0,.5)';
  for (let i = 0; i < rows.length; i++) g.fillRect(6, 27 + i * 13, 244, 1);

  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** CCTV monitor wall, four quadrants; `ghost` puts the Thing on camera 4 */
export function cctvTexture(time, { ghost = 0, attendantCam = -1 } = {}) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#060706'; g.fillRect(0, 0, 256, 192);

  const cams = ['01 WAITING HALL', '02 CONCOURSE', '03 BAGGAGE', '04 BAY 9'];
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * 128, y = ((i / 2) | 0) * 96;
    g.fillStyle = '#0c1109'; g.fillRect(x + 3, y + 3, 122, 90);

    // scanlines
    for (let sy = 0; sy < 90; sy += 2) {
      g.fillStyle = `rgba(150,190,120,${0.012 + Math.random() * 0.02})`;
      g.fillRect(x + 3, y + 3 + sy, 122, 1);
    }
    // crude room shapes so the feed reads as a place
    g.strokeStyle = 'rgba(150,190,120,.3)'; g.lineWidth = 1;
    g.strokeRect(x + 18, y + 30, 90, 50);
    g.beginPath(); g.moveTo(x + 18, y + 30); g.lineTo(x + 44, y + 14);
    g.lineTo(x + 84, y + 14); g.lineTo(x + 108, y + 30); g.stroke();

    if (i === attendantCam) {
      // a tall pale smudge, unmistakably a person
      g.fillStyle = 'rgba(190,210,170,.5)';
      g.fillRect(x + 60, y + 38, 7, 30);
      g.fillRect(x + 59, y + 33, 9, 6);
    }
    if (i === 3 && ghost > 0) {
      g.fillStyle = `rgba(230,240,220,${0.14 + ghost * 0.5})`;
      const gx = x + 30 + (1 - ghost) * 50;
      g.fillRect(gx, y + 26, 10, 46);
      g.fillRect(gx - 2, y + 20, 14, 7);
      // it is too tall for the doorway behind it
      g.fillStyle = `rgba(0,0,0,${0.3 * ghost})`;
      g.fillRect(gx - 4, y + 18, 18, 3);
    }

    g.fillStyle = '#7f9a5f'; g.font = '7px monospace';
    g.fillText(cams[i], x + 6, y + 10);
    g.fillText(time, x + 92, y + 88);
  }
  g.strokeStyle = '#000'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 192); g.moveTo(0, 96); g.lineTo(256, 96); g.stroke();

  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** flat posted sign; used for the rules sign and the route map */
export function signTexture(title, lines, { hand = false } = {}) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = hand ? '#b9b49b' : '#c9c8b4'; g.fillRect(0, 0, 128, 160);
  g.fillStyle = 'rgba(70,60,36,.18)'; g.fillRect(0, 0, 128, 160);
  g.fillStyle = '#1a1c16';
  g.font = hand ? 'italic 9px monospace' : 'bold 10px monospace';
  g.textBaseline = 'top';
  g.fillText(title.slice(0, 20), 8, 9);
  g.fillStyle = '#2a2d22'; g.fillRect(8, 22, 112, 1);
  g.font = hand ? 'italic 7px monospace' : '7px monospace';
  let y = 30;
  for (const ln of lines) {
    const words = ln.split(' '); let line = '';
    for (const wd of words) {
      if ((line + wd).length > 24) { g.fillText(line, 8, y); y += 9; line = ''; }
      line += wd + ' ';
    }
    g.fillText(line, 8, y); y += 13;
  }
  resetSeed(hand ? 512 : 611);
  grain(g, 128, 160, 0.4);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function disposeAll() { for (const t of cache.values()) t.dispose(); cache.clear(); }
