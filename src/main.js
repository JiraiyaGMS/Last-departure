/**
 * main.js — the renderer, the game loop, and the night.
 */
import * as THREE from 'three';
import { buildStation } from './level.js';
import { Collider } from './collision.js';
import { NavGrid } from './nav.js';
import { Player } from './player.js';
import { Attendant, ST } from './attendant.js';
import { GameLoop, fmt, START_MIN } from './loop.js';
import { RuleBook, POSTED } from './rules.js';
import { Notebook } from './notebook.js';
import { AudioEngine } from './audio.js';
import { LightRig } from './lights.js';
import { Director } from './scares.js';
import { Interactor, Thresholds, BOARD_ROWS, LOCKER_CODE } from './interact.js';
import { spawnEchoes } from './echoes.js';
import { UI } from './ui.js';
import { PS1, patchMaterials } from './ps1.js';
import * as T from './textures.js';
import { BAY9 } from './station.js';

const canvas = document.getElementById('view');
const G = {};   // the game, assembled in boot()

// ── renderer and scene ───────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);
scene.fog = new THREE.FogExp2(0x070a0d, 0.028);

const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 220);
scene.add(camera);

// Barely anything; the tubes do the work. Enough ambient to make out a shape
// in an unlit room, and no more — being unable to see at all is not frightening,
// it is just a black screen.
scene.add(new THREE.AmbientLight(0x18222e, 1.25));
const moon = new THREE.DirectionalLight(0x2a3f52, 0.75);
moon.position.set(-20, 30, -40);
scene.add(moon);

const ps1 = new PS1(renderer);

function resize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  ps1.setSize(w, h);
}
addEventListener('resize', resize);

// ── boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  const level = await buildStation();
  scene.add(level.group);

  const collider = new Collider(level.collider);
  scene.add(collider.mesh);

  const nav = new NavGrid(level.collide);
  const lights = new LightRig(level.lights, scene);
  const audio = new AudioEngine();
  camera.add(audio.listener);

  const notebook = new Notebook();
  const ui = new UI({ onClose: () => { if (G.running) player.requestLock(canvas); } });
  audio.onSubtitle((text, voice) => ui.say(text, voice === 'pa' ? 'pa' : 'ech'));

  const loop = new GameLoop({
    onEvent: e => onEvent(e),
    onReset: (reason, n) => onReset(reason, n),
    onExpire: () => onExpire(),
  });

  const rules = new RuleBook(loop, { onBreak: (r, real) => onRuleBreak(r, real) });

  const player = new Player(camera, collider, {
    onNoise: ev => { attendant.hear(ev); },
    onStep: (loud, pos) => {
      audio.at(scene, 'step', new THREE.Vector3(pos.x, 0.1, pos.z),
        { vol: 0.2 + loud * 0.25, rate: 0.95 + Math.random() * 0.14, ref: 2, max: 10, verb: 0.2 });
    },
  });
  player.teleport(level.spawnPlayer, level.spawnPlayerRot);

  const attendant = new Attendant({
    scene, nav, collider, audio,
    patrol: level.patrol, spawn: level.spawnAttendant, bay9: BAY9,
  });

  const echoes = spawnEchoes(scene, audio);

  const interactor = new Interactor({
    camera, player, level, audio, loop, rules, notebook, ui, lights, attendant, scene,
    onNoise: ev => attendant.hear(ev),
    onJukebox: obj => startJukebox(obj),
    onEchoStory: id => onEchoStory(id),
    onBoard: st => onBoard(st),
  });
  const thresholds = new Thresholds();

  const director = new Director({
    scene, player, collider, audio, lights, loop, attendant, ps1, ui, notebook, nav,
  });
  interactor.ctx.director = director;

  Object.assign(G, {
    level, collider, nav, lights, audio, notebook, ui, loop, rules, player,
    attendant, echoes, interactor, thresholds, director, ps1, scene, camera,
    running: false, paused: false, dying: false, ending: null,
    reducedFlash: false, fear: 0, prevPos: new THREE.Vector3(),
  });

  wireLiveSurfaces(level, loop, interactor);
  patchMaterials(scene, 190);
  resize();

  // a debug handle, and the live sliders the doc's stack asks lil-gui for
  window.__G = G;
  setupDebug();

  document.getElementById('loading').style.display = 'none';
  bindTitle();
  renderOnce();
}

// ── the live surfaces: board, clock, monitors, signs ─────────────────────────

function wireLiveSurfaces(level, loop, interactor) {
  G.surf = { board: null, cctv: null, hour: null, min: null, signs: [], notes: [], busDest: null,
             vendGlow: [], jukeGlow: null, mirror: null, belt: null };
  level.group.traverse(o => {
    const u = o.userData || {};
    if (u.boardFace) G.surf.board = o;
    if (u.cctvFace) G.surf.cctv = o;
    if (u.hourHand) G.surf.hour = o;
    if (u.minHand) G.surf.min = o;
    if (u.signFace) G.surf.signs.push(o);
    if (u.noteFace) G.surf.notes.push(o);
    if (u.busDest) G.surf.busDest = o;
    if (u.glow) G.surf.vendGlow.push(o);
    if (u.mirror) G.surf.mirror = o;
    if (u.belt) G.surf.belt = o;
  });

  if (G.surf.board) {
    G.surf.board.material = new THREE.MeshBasicMaterial({ map: T.boardTexture(BOARD_ROWS), fog: true });
  }
  if (G.surf.cctv) {
    G.surf.cctv.material = new THREE.MeshBasicMaterial({ map: T.cctvTexture(fmt(START_MIN)), fog: true });
  }
  // the posted rules sign renders from the rulebook, so the sign is the rules
  refreshSigns();
}

function refreshSigns() {
  const { rules, level } = G;
  const sign = level.byName.get('int_rulessign');
  const map = T.signTexture('STATION RULES', rules.signLines());
  if (sign) sign.traverse(o => { if (o.userData.signFace) {
    o.material = new THREE.MeshBasicMaterial({ map, fog: true });
  }});
  const route = level.byName.get('int_routemap');
  if (route) route.traverse(o => { if (o.userData.signFace) {
    o.material = new THREE.MeshBasicMaterial({
      map: T.signTexture('REGIONAL ROUTES', ['Winslow', 'Ashfork', 'Lundy Crossing', 'Tarn', 'Port Reyes', 'The Coast', 'Bay 0']), fog: true });
  }});
  for (const n of G.surf.notes) {
    n.material = new THREE.MeshBasicMaterial({
      map: T.signTexture('', ['the sign lies', 'two of them'], { hand: true }), fog: true });
  }
}

// ── title screen ─────────────────────────────────────────────────────────────

function bindTitle() {
  const title = document.getElementById('title');
  const name = document.getElementById('pname');
  const begin = document.getElementById('begin');
  const optFlash = document.getElementById('optFlash');
  const optSubs = document.getElementById('optSubs');
  const optInvert = document.getElementById('optInvert');

  name.value = G.notebook.data.name || '';
  name.focus();

  const go = async () => {
    const n = (name.value || '').trim().slice(0, 18) || 'Passenger';
    G.notebook.setName(n);
    G.reducedFlash = optFlash.checked;
    G.lights.reducedFlash = optFlash.checked;
    G.ui.subsOn = optSubs.checked;
    G.player.invertY = optInvert.checked;

    title.classList.add('gone');
    await G.audio.init();
    G.audio.startBeds();
    G.audio.startHeart();
    startAmbientSources();
    scheduleNight();
    G.rules.reshuffle(G.loop.loop);
    refreshSigns();

    G.running = true;
    G.loop.start();
    G.player.requestLock(canvas);

    // the first thing that happens is the building noticing you woke up
    setTimeout(() => G.audio.say('Grayhollow Transit Center. The terminal is closed to the public.',
      { voice: 'pa' }), 2200);
    setTimeout(() => G.audio.say(`Welcome back, ${n}.`, { voice: 'pa', name: true }), 11000);
    G.ui.say('You are on a bench. You did not mean to sleep here.', 'note');
    last = performance.now();
    requestAnimationFrame(frame);
  };

  begin.addEventListener('click', go);
  name.addEventListener('keydown', e => { if (e.code === 'Enter') go(); });
}

// ── ambient positional sources ───────────────────────────────────────────────

function startAmbientSources() {
  const { audio, level } = G;
  // the diesel at Bay 9, idling all night and never leaving
  const bus = level.byName.get('int_bus');
  if (bus) audio.loopOn(bus, 'diesel', { vol: 0.5, ref: 7, max: 60 });
  // the cold glow of the vending machines
  for (const n of ['int_vending_01', 'int_vending_02']) {
    const v = level.byName.get(n);
    if (v) audio.loopOn(v, 'hum', { vol: 0.22, rate: 1.01, ref: 2.5, max: 14 });
  }
}

function startJukebox(obj) {
  const { audio } = G;
  if (G.jukeSrc) return;
  G.jukeSrc = audio.loopOn(obj, 'juke', { vol: 0.55, ref: 6, max: 46 });
  // it runs down after a while, like the mechanism is tired
  setTimeout(() => {
    if (!G.jukeSrc) return;
    try { G.jukeSrc.stop(); } catch {}
    G.jukeSrc = null;
  }, 70000);
}

// ── the night's schedule ─────────────────────────────────────────────────────

function scheduleNight() {
  const l = G.loop;
  l.events.length = 0;
  l.on('23:55', 'pa_1', { pa: 'The 11:47 service to the coast is delayed.' })
   .on('00:12', 'pa_2', { pa: 'Passengers are reminded that the station rules are posted for your safety.' })
   .on('00:30', 'juke', {})
   .on('00:48', 'pa_3', { pa: 'Lost property is held for ninety days. After that it is held longer.' })
   .on('01:00', 'baggage_dark', {})
   .on('01:20', 'pa_4', { pa: 'Keep your ticket out of sight. The hour between one and two is not ours.' })
   .on('01:46', 'knock_big', {})
   .on('02:00', 'announce_2', {})
   .on('02:14', 'cam4', {})
   .on('02:30', 'deep_cut', {})
   .on('02:52', 'pa_5', { pa: 'The night attendant has concluded his rounds.' })
   .on('03:00', 'wait_bay9', {})
   .on('03:15', 'final_call', {})
   .on('03:30', 'last_call', {});
}

function onEvent(e) {
  const { audio, lights, attendant, loop, ui, notebook, director, player } = G;
  switch (e.id) {
    case 'pa_1': case 'pa_2': case 'pa_3': case 'pa_4': case 'pa_5':
      audio.say(e.data.pa, { voice: 'pa' });
      break;

    case 'juke': {
      const jb = G.level.byName.get('int_jukebox');
      if (jb) startJukebox(jb);
      audio.say('Something in the diner starts playing by itself.', { voice: 'echo', onSub: true });
      notebook.clue('juke_auto', 'At 12:30 the jukebox starts on its own.', loop.loop);
      break;
    }

    case 'baggage_dark': {
      const n = lights.killTagged('baggage');
      audio.play('lightOut', { vol: 0.8, verb: 0.6 });
      audio.cutHum(3.0);
      ui.say('Somewhere west of you, a bank of tubes lets go all at once.', 'note');
      notebook.clue('baggage_1', 'At 1:00 the lights in Baggage Claim fail. They do not come back.', loop.loop);
      break;
    }

    case 'knock_big': {
      audio.at(scene, 'knock', new THREE.Vector3(-15, 1, -20),
        { vol: 1.0, rate: 0.6, ref: 10, max: 90, verb: 0.9 });
      director.presence = 0.9;
      break;
    }

    case 'announce_2': {
      audio.cutHum(2.0);
      setTimeout(() => {
        audio.say('Remain seated. This announcement is for the fourteen.', { voice: 'pa' });
        G.ui.pulseNear(0.7, 4000);
      }, 2000);
      notebook.clue('two_am', 'The 2:00 announcement is for the fourteen. Be seated or hidden.', loop.loop);
      break;
    }

    case 'cam4': {
      director.cameraGhost = Math.max(director.cameraGhost, 0.45);
      audio.play('presence', { vol: 0.55 });
      G.ui.pulseNear(0.8, 2600);
      audio.say('It is on camera four.', { voice: 'echo' });
      notebook.clue('cam4_214', 'At 2:14 something is on camera 4. It is not Walter.', loop.loop);
      break;
    }

    case 'deep_cut': {
      // the whole building goes quiet, and one tube near the player dies
      audio.cutHum(5.5);
      const near = lights.nearestLive(player.pos, 2, 16);
      if (near) near.kill();
      director.presence = 1;
      G.ui.pulseNear(1.0, 3000);
      break;
    }

    case 'wait_bay9': {
      attendant.setState(ST.WAIT);
      audio.say('All remaining passengers to Bay 9.', { voice: 'pa' });
      notebook.clue('three_am', 'From 3:00 he stops walking the route and stands at Bay 9.', loop.loop);
      break;
    }

    case 'final_call':
      audio.say('Final boarding, Bay 9, three thirty-three.', { voice: 'pa' });
      break;

    case 'last_call':
      audio.say('Bay 9. Three minutes.', { voice: 'pa' });
      audio.play('bell', { vol: 0.3 });
      break;
  }
}

// ── rules ────────────────────────────────────────────────────────────────────

function onRuleBreak(rule, real) {
  const { attendant, player, audio, ui, notebook, loop } = G;
  notebook.rule(rule.id, rule.text, real ? 'real' : 'fake');
  if (real) {
    ui.say(`— ${rule.text} —`, 'note');
    audio.play('presence', { vol: 0.45 });
    audio.cutHum(2.2);
    attendant.reportedAt(player.pos.clone());
    notebook.clue(`broke_${rule.id}`, `Breaking "${rule.text}" tells him exactly where I am.`, loop.loop);
  } else {
    // a fake rule costs you nothing he can hear, but something else notices
    ui.say('Nothing happens. Nothing at all happens.', 'note');
    G.director.cameraGhost = Math.min(1, G.director.cameraGhost + 0.18);
    notebook.clue(`fake_${rule.id}`, `"${rule.text}" is a lie. Obeying it fed something.`, loop.loop);
  }
}

// ── the catch ────────────────────────────────────────────────────────────────

async function doCatch() {
  const { audio, ui, player, attendant, notebook, ps1, loop } = G;
  if (G.dying) return;
  G.dying = true;
  G.loop.pause();
  document.exitPointerLock?.();

  audio.play('punch', { vol: 0.7 });
  audio.play('stinger', { vol: 0.5, verb: 0.4 });
  audio.play('gasp', { vol: 0.5 });
  audio.setHeart(1);
  ui.pulseNear(1, 2600);

  // he fills the frame. You get to look at the place where his face is not.
  const target = attendant.pos.clone().setY(1.75);
  const t0 = performance.now();
  await new Promise(res => {
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 700);
      const to = target.clone().sub(player.eyePosition()).normalize();
      player.yaw = THREE.MathUtils.lerp(player.yaw, Math.atan2(-to.x, -to.z), 0.22);
      player.pitch = THREE.MathUtils.lerp(player.pitch, 0.1, 0.18);
      player.fear = 1;
      ps1.set('uFear', 1);
      ps1.set('uGlitch', k * 0.9);
      ps1.set('uFade', Math.max(0, (k - 0.55) / 0.45));
      if (k < 1) requestAnimationFrame(step); else res();
    };
    step();
  });

  ps1.set('uFade', 1);
  ps1.set('uGlitch', 0);
  notebook.died();

  const lines = [
    'He punches your ticket.',
    `You wake on the bench. 11:47 PM.`,
  ];
  await ui.wakeSequence(lines);
  G.loop.reset('caught');
}

async function onExpire() {
  const { ui, audio, ps1, notebook } = G;
  if (G.dying) return;
  G.dying = true;
  G.loop.pause();
  document.exitPointerLock?.();
  audio.say('The 3:33 service has departed.', { voice: 'pa' });
  audio.play('stinger', { vol: 0.35, rate: 0.8 });
  ps1.set('uFade', 1);
  notebook.died();
  await ui.wakeSequence([
    'The board goes blank. The diesel stops.',
    'You wake on the bench. 11:47 PM.',
  ]);
  G.loop.reset('expired');
}

function onReset(reason, n) {
  const { player, level, attendant, echoes, lights, rules, interactor, director, ui, audio, ps1 } = G;
  player.teleport(level.spawnPlayer, level.spawnPlayerRot);
  player.battery = 1;
  player.flashOn = false;
  player.fear = 0;
  attendant.reset();
  for (const e of echoes) e.resetLoop();
  lights.reviveAll();
  rules.reshuffle(n);
  refreshSigns();
  interactor.resetLoop();
  director.reset();
  if (G.jukeSrc) { try { G.jukeSrc.stop(); } catch {} G.jukeSrc = null; }
  audio.setHum(0.09);
  audio.setHeart(0);
  ui.setLoop(n);
  ps1.set('uFade', 0);
  ps1.set('uFear', 0);
  G.dying = false;
  G.loop.start();
  player.requestLock(canvas);
  ui.say('The same bench. The same 11:47. Your notebook is still in your pocket.', 'note');
}

// ── echo stories ─────────────────────────────────────────────────────────────

function onEchoStory(id) {
  const { audio, notebook, interactor, ui, loop } = G;
  const story = {
    e01: 'She was going to the coast to see a sister she had argued with.',
    e02: 'He had a pay envelope and a bus to catch and nowhere in particular to be.',
    e03: 'His mother went to the ticket window and has not come back.',
  }[id];
  if (story) audio.say(story, { voice: 'echo' });
  const n = interactor.inv.heardStories.length;
  ui.say(`${n} of 3 belongings returned.`, 'note');
  if (n >= 3) {
    notebook.clue('own_slip',
      'With all three stories heard, the blank slip in Lost & Found is mine. '
      + 'It has my name on it now.', loop.loop);
    audio.say('The blank slip has your name on it now.', { voice: 'echo' });
  }
}

// ── boarding, and the four endings ───────────────────────────────────────────

async function onBoard(st) {
  const { ui, audio, notebook, ps1, interactor, loop } = G;
  if (!loop.past('03:30')) {
    ui.say('The door is shut. It opens at 3:33 and not before.', 'note');
    return;
  }
  if (!st.stub || !st.stamp) {
    ui.say('The driver you cannot see does not open the door. '
         + 'You need a stamped stub and a punched transfer.', 'note');
    return;
  }
  if (!st.punched || !st.slip) {
    ui.say('Your stub is stamped but your transfer is not punched. The door stays shut.', 'note');
    return;
  }

  const all3 = st.stories.length >= 3;
  let ending;
  if (st.slip.id === 'blank') {
    ending = all3
      ? { id: 'Home', good: true, lines: [
          'The bus pulls out and the fog goes past and then it is light.',
          'It sets you down outside your own house at dawn.',
          'There is a quarter in your coat pocket, dated 1987.'] }
      : { id: 'nowhere', good: false, lines: [
          'The slip has no destination on it, and neither do you.',
          'The bus pulls out into the fog and does not arrive.',
          'You wake on the bench. 11:47 PM.'] };
  } else if (st.stories.includes(st.slip.echo)) {
    ending = { id: 'The Coast (heard)', good: false, lines: [
      'You board on her slip, and you know whose it was.',
      'The fog takes the windows. Somewhere behind you the board clatters over.',
      'You wake on the bench. The board lists fourteen passengers, and one more.'] };
  } else {
    ending = { id: 'The Coast', good: false, lines: [
      'You board on a stranger’s slip without ever hearing their name.',
      'The bus pulls out into the fog. It does not arrive anywhere.',
      'You wake on the bench. The departure board now lists you as a passenger.'] };
  }

  G.dying = true;
  G.loop.pause();
  document.exitPointerLock?.();
  audio.play('bell', { vol: 0.3 });
  audio.say('Now boarding, Bay 9.', { voice: 'pa' });
  ps1.set('uFade', 1);
  notebook.ending(ending.id);
  await ui.wakeSequence(ending.lines, { hold: 6200 });
  if (ending.good) {
    await ui.wakeSequence(['LAST DEPARTURE', `${notebook.data.name}, 3:33 AM`], { hold: 5200 });
  }
  G.loop.reset(ending.good ? 'home' : 'coast');
}

/** Night Shift: hand him the valid ticket instead of boarding */
async function giveTicketToWalter() {
  const { ui, audio, notebook, ps1, interactor } = G;
  const st = interactor.ticketState();
  if (!st.valid) return false;
  G.dying = true;
  G.loop.pause();
  document.exitPointerLock?.();
  audio.play('punch', { vol: 0.3, rate: 0.8 });
  audio.say('Thank you.', { voice: 'echo' });
  ps1.set('uFade', 1);
  notebook.ending('Night Shift');
  await ui.wakeSequence([
    'He looks at the ticket for a long time.',
    'Then he takes off the cap and hands it to you, and gets on the bus.',
    'The uniform fits. It was always going to.',
    'Somewhere in the hall, a sleeper is waking up on a bench.',
  ], { hold: 7400 });
  G.loop.reset('nightshift');
  return true;
}

// ── debug sliders (backslash) ────────────────────────────────────────────────

let gui = null;
async function setupDebug() {
  const open = async () => {
    if (gui) { gui.destroy(); gui = null; return; }
    const { default: GUI } = await import('lil-gui');
    gui = new GUI({ title: 'Last Departure \u2014 debug' });
    gui.domElement.style.zIndex = '80';

    const f1 = gui.addFolder('Night');
    f1.add(G.loop, 'min', START_MIN, START_MIN + 226, 1).name('clock (min)').listen();
    f1.add({ skip: () => { G.loop.min += 20; } }, 'skip').name('+20 game min');
    f1.add(G.loop, 'loop').name('loop #').listen().disable();

    const f2 = gui.addFolder('Look');
    f2.add(scene.fog, 'density', 0, 0.12, 0.001).name('fog').listen();
    f2.add(ps1.uniforms.uFear, 'value', 0, 1, 0.01).name('fear').listen();
    f2.add(ps1.uniforms.uGlitch, 'value', 0, 1, 0.01).name('glitch').listen();
    f2.add(ps1.uniforms.uDither, 'value', 0, 1, 0.01).name('dither');

    const f3 = gui.addFolder('Attendant');
    f3.add(G.attendant, 'state').name('state').listen().disable();
    f3.add(G.attendant, 'alert', 0, 1).name('alert').listen().disable();
    f3.add(G.attendant, 'distToPlayer', 0, 60).name('distance').listen().disable();
    f3.add({ here: () => { G.attendant.reportedAt(G.player.pos.clone()); } }, 'here')
      .name('send him at me');

    const f4 = gui.addFolder('Director');
    f4.add(G.director, 'tension', 0, 1).name('tension').listen().disable();
    f4.add(G.director, 'cameraGhost', 0, 1, 0.01).name('camera 4').listen();
    for (const k of ['glimpse', 'behind', 'lightout', 'knock', 'presence', 'namecall', 'flap'])
      f4.add({ [k]: () => G.director['_' + k]() }, k);

    const f5 = gui.addFolder('Give me');
    f5.add({ ticket: () => {
      const i = G.interactor.inv;
      i.stub = i.stamp = i.punched = true; i.keyring = i.punch = true;
      i.slip = { id: 'blank', label: 'a blank slip', echo: null };
      G.ui.say('debug: valid ticket', 'note');
    } }, 'ticket').name('a valid ticket');
    f5.add({ torch: () => { G.interactor.inv.flashlight = true; G.player.hasFlashlight = true; } },
      'torch');
    f5.add({ wipe: () => { G.notebook.wipe(); G.ui.say('notebook wiped', 'note'); } }, 'wipe')
      .name('wipe notebook');
  };
  addEventListener('keydown', e => {
    if (e.code === 'Backslash' && G.running) { e.preventDefault(); open(); }
  });
}

// ── input ────────────────────────────────────────────────────────────────────

addEventListener('keydown', e => {
  if (!G.running) return;
  const { ui, interactor, player, audio, rules, notebook, loop } = G;

  if (ui.modal) { if (ui.key(e)) e.preventDefault(); return; }

  switch (e.code) {
    case 'Tab':
      e.preventDefault();
      ui.openNotebook(notebook, loop);
      break;
    case 'Escape':
      togglePause(true);
      break;
    case 'KeyE':
      if (player.hiding) { player.exitHide(); ui.say('You straighten up.', 'note'); break; }
      // standing in front of Walter at Bay 9 with a valid ticket
      if (G.attendant.state === ST.WAIT && G.attendant.distToPlayer < 2.6
          && interactor.ticketState().valid) {
        giveTicketToWalter();
        break;
      }
      interactor.use();
      break;
    case 'KeyF': {
      const on = player.toggleFlashlight();
      if (player.hasFlashlight) {
        audio.play('clunk', { vol: 0.2, rate: 2.2 });
        if (!on && player.battery <= 0) ui.say('The cell is flat.', 'note');
      } else {
        ui.say('You have no torch. There is one in the building.', 'note');
      }
      break;
    }
    case 'KeyQ':
      interactor.toggleTicket();
      break;
    case 'KeyR':
      interactor.punchSlip();
      break;
    case 'KeyY':
      // answering the PA. The sign said not to.
      if (ui.takeAnswer()) {
        rules.s.answeredPA = true;
        audio.play('gasp', { vol: 0.3 });
        ui.say('You say "yes".', 'note');
      }
      break;
    case 'KeyM':
      audio.setMuted(!audio.muted);
      ui.say(audio.muted ? 'Sound off.' : 'Sound on.', 'note');
      break;
  }
});

canvas.addEventListener('click', () => {
  if (!G.running) return;
  if (G.paused) { togglePause(false); return; }
  if (!G.ui.modal) G.player.requestLock(canvas);
});

// Only pause on a lock we actually held and then lost. A lock request the
// browser simply refuses must not drop the player into a pause screen they did
// not ask for.
let hadLock = false;
document.addEventListener('pointerlockchange', () => {
  const locked = !!document.pointerLockElement;
  if (!G.running || G.dying) { hadLock = locked; return; }
  if (!locked && hadLock && !G.ui.modal) togglePause(true);
  hadLock = locked;
});

function togglePause(on) {
  if (G.dying) return;
  G.paused = on;
  G.ui.showPause(on);
  if (on) { G.loop.pause(); document.exitPointerLock?.(); }
  else { G.loop.start(); G.player.requestLock(canvas); }
}

// ── frame ────────────────────────────────────────────────────────────────────

let last = performance.now();
let boardRefresh = 0, cctvRefresh = 0;

function renderOnce() { ps1.render(scene, camera, 0.016); }

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const { player, attendant, loop, rules, lights, audio, ui, interactor,
          director, echoes, collider, thresholds, level } = G;

  const frozen = G.paused || !!ui.modal || G.dying;

  // ---- clock and events ----
  if (!G.paused && !ui.modal) loop.update(dt);

  // ---- player ----
  G.prevPos.copy(player.pos);
  player.update(dt, { canMove: !frozen });
  if (!frozen) {
    const msg = thresholds.constrain(G.prevPos, player.pos, interactor.inv);
    if (msg && !G._lastDoorMsg) {
      ui.say(msg, 'note');
      audio.play('clunk', { vol: 0.3, rate: 1.5 });
      G._lastDoorMsg = 1.5;
    }
  }
  G._lastDoorMsg = Math.max(0, (G._lastDoorMsg || 0) - dt);

  // ---- the staring rule needs to know where you are looking ----
  if (!frozen) {
    const board = level.byName.get('int_departureboard');
    if (board) {
      const to = board.position.clone().setY(3.5).sub(player.eyePosition());
      const d = to.length();
      const looking = d < 22 && player.forward().dot(to.normalize()) > 0.93
        && collider.canSee(player.eyePosition(), board.position.clone().setY(3.5));
      if (looking) {
        rules.s.boardStare += dt * 2.4;     // the decay in RuleBook nets ~1x
        if (rules.s.boardStare > 7 && rules.s.boardStare < 7.1) {
          ui.say('Look away.', 'note');
        }
      }
    }
  }

  // ---- the station ----
  if (!frozen) {
    attendant.update(dt, player, loop);
    for (const e of echoes) e.update(dt, player, collider, loop);
    rules.update(dt, player);
    director.update(dt);
  }
  lights.update(dt);

  // he disturbs the tubes he walks under
  const nearTube = lights.nearestLive(attendant.pos, 0, 3.5);
  if (nearTube && attendant.speed > 0.1 && Math.random() < dt * 2.5) nearTube.disturb(1);

  // ---- the catch ----
  if (attendant.state === ST.GRAB && !G.dying) doCatch();

  // ---- fear ----
  const dread = Math.max(attendant.dread(player), director.presence * 0.75);
  G.fear = THREE.MathUtils.damp(G.fear, dread, 3.2, dt);
  player.fear = G.fear;
  ps1.set('uFear', G.fear);
  ps1.set('uGlitch', Math.max(0, (director.cameraGhost - 0.5) * 0.5
                              + (attendant.state === ST.HUNT ? G.fear * 0.3 : 0)));
  ps1.set('uDither', 1);
  audio.setHeart(Math.max(0, G.fear * 1.1 - 0.12));
  audio.tick(now / 1000);

  // breathing when hiding, which is the loudest thing you own
  if (player.hiding && !G._breathTimer) {
    G._breathTimer = 1;
    const int = player.holding ? 9 : (1.6 - G.fear * 0.7);
    setTimeout(() => { G._breathTimer = 0; }, int * 1000);
    if (!player.holding) {
      audio.play(Math.random() < 0.5 ? 'breathIn' : 'breathOut',
        { vol: 0.12 + G.fear * 0.2, rate: 0.9 + G.fear * 0.25 });
    }
  }
  if (player.breath <= 0 && player.holding) audio.play('gasp', { vol: 0.35 });

  // ---- fog: the bays are the only place weather happens ----
  const outdoors = player.pos.z < -24;
  const wantFog = outdoors ? 0.055 : 0.026 + G.fear * 0.012;
  scene.fog.density = THREE.MathUtils.damp(scene.fog.density, wantFog, 2, dt);

  // ---- live surfaces ----
  boardRefresh -= dt;
  if (boardRefresh <= 0 && G.surf.board) {
    boardRefresh = 2.5;
    const rows = BOARD_ROWS.map(r => ({ ...r }));
    if (loop.past('03:00')) {
      const last = rows[rows.length - 1];
      last.status = loop.past('03:30') ? 'BOARDING' : 'SCHEDULED';
    }
    const old = G.surf.board.material.map;
    G.surf.board.material.map = T.boardTexture(rows, { glitch: G.fear > 0.6 ? 0.2 : 0 });
    G.surf.board.material.needsUpdate = true;
    old?.dispose();
  }
  cctvRefresh -= dt;
  if (cctvRefresh <= 0 && G.surf.cctv) {
    cctvRefresh = 1.0;
    const cam = interactor._attendantCam();
    const old = G.surf.cctv.material.map;
    G.surf.cctv.material.map = T.cctvTexture(loop.timeString, {
      ghost: loop.past('02:14') ? Math.max(director.cameraGhost, 0.45) : director.cameraGhost,
      attendantCam: cam });
    G.surf.cctv.material.needsUpdate = true;
    old?.dispose();
  }
  if (G.surf.hour && G.surf.min) {
    const m = ((loop.min % 1440) + 1440) % 1440;
    G.surf.hour.rotation.z = -((m / 60) % 12) / 12 * Math.PI * 2;
    G.surf.min.rotation.z = -(m % 60) / 60 * Math.PI * 2;
  }
  if (G.surf.belt) G.surf.belt.position.x = -15 + Math.sin(now / 4000) * 0.02;
  for (const o of level.interactables) {
    if (o.obj.userData.spin) o.obj.rotation.y += dt * 1.4;
  }

  // ---- HUD ----
  ui.setClock(loop.timeString);
  ui.setCarry(interactor.carryLines());
  ui.setBreath(player.breath, !!player.hiding);
  ui.setBattery(player.battery, player.hasFlashlight && player.flashOn);
  ui.setFear(G.fear);
  ui.tickSubs(now);
  if (!frozen && !ui.answerOpen) {
    const f = interactor.pick();
    let p = interactor.promptFor(f);
    if (!p && attendant.state === ST.WAIT && attendant.distToPlayer < 2.6
        && interactor.ticketState().valid) {
      p = '<b>E</b> hand him your ticket';
    }
    if (!p && player.hiding) p = '<b>E</b> come out &nbsp;<b>Space</b> hold your breath';
    ui.setPrompt(p);
  } else if (!ui.answerOpen) {
    ui.setPrompt('');
  }

  ps1.render(scene, camera, dt);
}

boot().catch(err => {
  console.error(err);
  const l = document.getElementById('loading');
  if (l) { l.style.display = 'grid'; l.textContent = 'failed to open the terminal — see console'; }
});
