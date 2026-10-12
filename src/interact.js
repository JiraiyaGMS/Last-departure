/**
 * interact.js — the raycast, the prompts, and the three-part ticket.
 *
 * A Raycaster from the centre of the camera looks for int_ and hide_ objects
 * within two metres and shows a prompt; E uses it. Every puzzle in the doc's
 * ticket chain is wired here:
 *
 *   stub     five 1987 coins  → the ticket machine prints it
 *   stamp    the keyring from Security → Walter's locked drawer
 *   transfer a passenger's slip from Lost & Found, punched with the conductor's
 *            punch, which is in a luggage locker whose code is spelled by the
 *            first letters of the cancelled routes on the departure board
 *
 * The board spells WALT. It is his name, and nobody tells you that.
 */
import * as THREE from 'three';
import { handwrittenLines, POSTED } from './rules.js';

export const BOARD_ROWS = [
  { dest: 'Winslow',        bay: 3, time: '12:15', status: 'CANCELLED' },
  { dest: 'Port Reyes',     bay: 1, time: '12:40', status: 'DEPARTED'  },
  { dest: 'Ashfork',        bay: 5, time: '1:20',  status: 'CANCELLED' },
  { dest: 'Lundy Crossing', bay: 2, time: '2:05',  status: 'CANCELLED' },
  { dest: 'Kettle Falls',   bay: 7, time: '2:45',  status: 'DEPARTED'  },
  { dest: 'Tarn',           bay: 4, time: '3:10',  status: 'CANCELLED' },
  { dest: 'The Coast',      bay: 9, time: '3:33',  status: 'SCHEDULED' },
];

export const LOCKER_CODE =
  BOARD_ROWS.filter(r => r.status === 'CANCELLED').map(r => r.dest[0]).join('');  // WALT

export const COINS_NEEDED = 5;

/** The passengers' transfer slips. Which one you punch decides the ending. */
export const SLIPS = [
  { id: 'hatbox', label: 'a slip in a hatbox lining',   echo: 'e01', dest: 'The Coast' },
  { id: 'coat',   label: 'a slip in a work coat pocket', echo: 'e02', dest: 'The Coast' },
  { id: 'boy',    label: 'a child’s half-fare slip', echo: 'e03', dest: 'The Coast' },
  { id: 'blank',  label: 'a blank slip, never filled in', echo: null,  dest: '—' },
];

export const INV = () => ({
  coins: 0, stub: false, stamp: false, slip: null, punched: false,
  keyring: false, flashlight: false, punch: false, walkie: false,
  ticketOut: false, lockerOpen: false, ticketOffice: false,
  heardStories: [], jukeboxPlayed: false, mirrorRead: false, handwrittenRead: false,
});

/** locked thresholds: the player is pushed back out of them until unlocked */
export class Thresholds {
  constructor() {
    this.list = [
      { id: 'ticket', axis: 'x', at: -14, from: -2, to: 1, needs: 'keyring',
        msg: 'The ticket office door is locked. A deadbolt, from the inside.' },
    ];
  }
  /** returns a message if the move was refused */
  constrain(prevPos, pos, inv) {
    for (const t of this.list) {
      if (inv[t.needs]) continue;
      if (t.axis === 'x') {
        const crossed = (prevPos.x > t.at) !== (pos.x > t.at);
        if (crossed && pos.z > t.from - 0.6 && pos.z < t.to + 0.6) {
          pos.x = prevPos.x > t.at ? t.at + 0.45 : t.at - 0.45;
          return t.msg;
        }
      } else {
        const crossed = (prevPos.z > t.at) !== (pos.z > t.at);
        if (crossed && pos.x > t.from - 0.6 && pos.x < t.to + 0.6) {
          pos.z = prevPos.z > t.at ? t.at + 0.45 : t.at - 0.45;
          return t.msg;
        }
      }
    }
    return null;
  }
}

export class Interactor {
  constructor(ctx) {
    this.ctx = ctx;   // {camera, player, level, audio, loop, rules, notebook, ui, lights, attendant, scene, director}
    this.ray = new THREE.Raycaster();
    this.ray.far = 2.4;
    this.inv = INV();
    this.focus = null;
    this.taken = new Set();        // int_ names consumed this loop
    this.boardLooking = false;
    this.shelfIdx = 0;
  }

  resetLoop() {
    const keepFlash = this.inv.flashlight;
    const stories = this.inv.heardStories.slice();
    this.inv = INV();
    // the doc is explicit: items reset. The flashlight is the one concession,
    // because hunting it down again every loop is tedium, not tension.
    this.inv.flashlight = keepFlash;
    this.inv.heardStories = stories;
    this.taken.clear();
    this.shelfIdx = 0;
  }

  /** the thing the player is looking at, or null */
  pick() {
    const { camera, level, player } = this.ctx;
    this.ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const eye = player.eyePosition();

    let best = null, bd = Infinity;
    const consider = (item, kind) => {
      const d = item.pos.distanceTo(eye);
      if (d > 2.6) return;
      // must be roughly in front, and not through a wall
      const to = item.pos.clone().sub(eye).normalize();
      if (player.forward().dot(to) < 0.55) return;
      if (d < bd) { bd = d; best = { ...item, kindClass: kind }; }
    };

    for (const i of level.interactables) {
      if (this.taken.has(i.name)) continue;
      consider(i, 'int');
    }
    if (!player.hiding) for (const h of level.hides) consider(h, 'hide');

    this.focus = best;
    return best;
  }

  /** the prompt line for the current focus */
  promptFor(f) {
    if (!f) return null;
    if (f.kindClass === 'hide') {
      const w = { bench: 'get under the bench', stall: 'step into the stall',
                  locker: 'climb into the locker', conveyor: 'get behind the conveyor' };
      return `<b>E</b> ${w[f.kind] || 'hide'}`;
    }
    const n = f.name;
    const L = (s) => `<b>E</b> ${s}`;
    if (n.startsWith('int_coin')) return L('pick up a coin');
    if (n === 'int_ticketmachine') return L(`use the ticket machine  (${this.inv.coins}/${COINS_NEEDED})`);
    if (n === 'int_departureboard') return L('read the departure board');
    if (n === 'int_wallclock') return L('check the clock');
    if (n === 'int_rulessign') return L('read the station rules');
    if (n === 'int_handwrittensign') return L('read the handwritten sign');
    if (n === 'int_mirror') return L('look in the mirror');
    if (n === 'int_nightlog') return L('read the night log');
    if (n === 'int_stampdrawer') return L(this.inv.keyring ? 'unlock the drawer' : 'try the drawer');
    if (n === 'int_keyring') return L('take the keyring');
    if (n === 'int_monitors') return L('watch the monitors');
    if (n === 'int_pa_mic') return L('make an announcement');
    if (n === 'int_jukebox') return L('play the jukebox');
    if (n.startsWith('int_vending')) return L('use the vending machine');
    if (n === 'int_transferslips') return L('look through the transfer slips');
    if (n.startsWith('int_shelf')) return L('search the shelf');
    if (n === 'int_conveyor') return L('search the conveyor');
    if (n === 'int_lockerpanel') return L(this.inv.lockerOpen ? 'the locker is open' : 'try the locker dial');
    if (n === 'int_bus') return L('board the bus');
    if (n === 'int_coffeepot') return L('the coffee pot');
    if (n === 'int_routemap') return L('read the route map');
    if (n === 'int_bench_note') return L('read the note');
    if (n === 'int_trash_hall') return L('look in the bin');
    return L('examine');
  }

  // ── use ───────────────────────────────────────────────────────────────────

  use() {
    const { player, audio, loop, notebook, ui, rules, scene, attendant, lights } = this.ctx;
    const f = this.focus;
    if (!f) return;

    if (f.kindClass === 'hide') {
      player.enterHide(f);
      audio.play('creak', { vol: 0.3, rate: 1.4 });
      ui.say(f.kind === 'locker'
        ? 'You pull the door to. The vent slits give you a strip of the room.'
        : 'You fold yourself in and go still.', 'note');
      return;
    }

    const n = f.name;
    const noise = (loud, kind = 'use') =>
      this.ctx.onNoise?.({ pos: f.pos.clone(), loud, kind });

    // ---- coins -------------------------------------------------------------
    if (n.startsWith('int_coin')) {
      this.inv.coins++;
      this.taken.add(n);
      f.obj.visible = false;
      audio.at(scene, 'coin', f.pos, { vol: 0.5, ref: 3, max: 16 });
      ui.say(`A quarter, dated 1987. (${this.inv.coins}/${COINS_NEEDED})`, 'note');
      notebook.clue('coins', `The machine wants exact change. ${COINS_NEEDED} coins, all 1987.`, loop.loop);
      noise(0.12);
      return;
    }

    // ---- the ticket machine ------------------------------------------------
    if (n === 'int_ticketmachine') {
      if (this.inv.stub) { ui.say('Your stub is already printed.', 'note'); return; }
      if (this.inv.coins < COINS_NEEDED) {
        audio.play('clunk', { vol: 0.4, rate: 1.4 });
        ui.say(`It wants exact change. ${COINS_NEEDED} coins, 1987. You have ${this.inv.coins}.`, 'note');
        notebook.clue('coins', `The machine wants exact change. ${COINS_NEEDED} coins, all 1987.`, loop.loop);
        noise(0.3);
        return;
      }
      this.inv.coins -= COINS_NEEDED;
      this.inv.stub = true;
      this.inv.ticketOut = true;
      audio.play('ticket', { vol: 0.7, verb: 0.3 });
      audio.play('bell', { vol: 0.2, delay: 1.2 });
      ui.say('The machine chews for a long moment and spits out a stub. '
           + 'Your name is already printed on it.', 'note');
      notebook.clue('stub', 'The stub prints with my name on it. It was always going to.', loop.loop);
      noise(0.55);
      return;
    }

    // ---- the departure board ----------------------------------------------
    if (n === 'int_departureboard') {
      ui.openBoard(BOARD_ROWS, loop);
      rules.s.boardStare = Math.max(rules.s.boardStare, 0.1);
      notebook.clue('board_cnx',
        'Cancelled routes on the board: Winslow, Ashfork, Lundy Crossing, Tarn. '
        + 'First letters: W A L T.', loop.loop);
      notebook.code('Locker dial', LOCKER_CODE);
      return;
    }

    // ---- the clock ---------------------------------------------------------
    if (n === 'int_wallclock') {
      ui.say(`The hands say ${loop.timeString}. The second hand does not move.`, 'note');
      return;
    }

    // ---- signs and the mirror ---------------------------------------------
    if (n === 'int_rulessign') {
      ui.openSign('Station Rules', rules.signLines(), { marks: this.inv.handwrittenRead ? rules : null });
      for (const r of rules.active) notebook.rule(r.id, r.text, 'unknown');
      return;
    }
    if (n === 'int_handwrittensign') {
      this.inv.handwrittenRead = true;
      ui.openSign('(handwritten, taped low)', handwrittenLines(), { hand: true });
      for (const r of POSTED) if (!r.real) notebook.rule(r.id, r.text, 'fake');
      notebook.clue('handwritten',
        'A second sign in the restroom, in pencil. It names the rules that are lies.', loop.loop);
      audio.play('presence', { vol: 0.25 });
      return;
    }
    if (n === 'int_mirror') {
      this.inv.mirrorRead = true;
      const after2 = loop.past('02:00');
      const lines = rules.active.map(r => {
        const real = r.real;
        return after2 ? (real ? r.text : `— ${r.text} —`) : r.text;
      });
      ui.openSign(after2 ? 'In the mirror (after 2:00)' : 'In the mirror', lines,
        { mirror: true, note: after2
          ? 'Struck through in the glass: the ones that were never true.'
          : 'The signs read the same. For now.' });
      if (after2) {
        for (const r of POSTED) notebook.rule(r.id, r.text, r.real ? 'real' : 'fake');
        notebook.clue('mirror_true', 'After 2 AM only the mirrored rules are true.', loop.loop);
      }
      audio.play('breathIn', { vol: 0.22, rate: 0.9 });
      return;
    }

    // ---- Walter's office --------------------------------------------------
    if (n === 'int_nightlog') {
      ui.openSign('Night log — W. Penn', [
        '2 Nov. Quiet. Boiler knocking again.',
        '3 Nov. 14 out on the 11:47. Stamped every one.',
        '3 Nov, later. Bus never called in. Dispatch says no bus.',
        '4 Nov. The 11:47 is on the board again.',
        '9 Nov. I stopped going home. There is no point to it.',
        '— undated — They keep arriving. I keep stamping. It is the only',
        'thing that gets anyone out of here.',
        '— undated — Do not let it take a ticket. It cannot be given one.',
      ]);
      notebook.clue('walter', 'Walter Penn stamped all fourteen. He never got on.', loop.loop);
      notebook.clue('thing_noticket', 'The thing on camera 4 cannot be given a ticket.', loop.loop);
      return;
    }
    if (n === 'int_stampdrawer') {
      if (!this.inv.keyring) {
        audio.play('clunk', { vol: 0.35, rate: 1.7 });
        ui.say('Locked. Something heavy shifts inside it.', 'note');
        notebook.clue('drawer', 'The stamp is in Walter’s drawer. His keyring opens it.', loop.loop);
        noise(0.25);
        return;
      }
      this.inv.stamp = true;
      this.taken.add(n);
      audio.play('clunk', { vol: 0.5, rate: 0.8 });
      ui.say('The destination stamp. Rubber, worn smooth. It says THE COAST.', 'note');
      notebook.clue('stamp', 'Got the destination stamp from the drawer.', loop.loop);
      noise(0.3);
      return;
    }

    // ---- Security ---------------------------------------------------------
    if (n === 'int_keyring') {
      this.inv.keyring = true;
      this.taken.add(n);
      f.obj.visible = false;
      audio.at(scene, 'keys', f.pos, { vol: 0.6, ref: 3, max: 20 });
      ui.say('His keyring. Heavier than you expected. '
           + 'Somewhere in the building, the jingling has stopped.', 'note');
      notebook.clue('keyring', 'The keyring is in Security. Taking it opens the ticket office.', loop.loop);
      // he knows instantly. This is a reportable theft, not a noise.
      attendant.reportedAt(f.pos.clone());
      audio.play('presence', { vol: 0.5 });
      return;
    }
    if (n === 'int_monitors') {
      const ghost = this.ctx.director?.cameraGhost ?? 0;
      const cam = this._attendantCam();
      ui.openCCTV(loop, { ghost: loop.past('02:14') ? Math.max(ghost, 0.45) : ghost, attendantCam: cam });
      if (loop.past('02:14')) {
        notebook.clue('cam4_214', 'At 2:14 something is on camera 4. It is not Walter.', loop.loop);
      }
      if (cam >= 0) notebook.clue('cctv_use', 'The monitors show where he is. Camera by camera.', loop.loop);
      return;
    }
    if (n === 'int_pa_mic') {
      // lure him. The PA is the one real tool against him.
      const spots = [
        { label: 'Baggage Claim', pos: new THREE.Vector3(-15, 0, -18) },
        { label: 'the Diner', pos: new THREE.Vector3(14, 0, -18) },
        { label: 'Lost & Found', pos: new THREE.Vector3(-19, 0, 9) },
        { label: 'the Waiting Hall', pos: new THREE.Vector3(0, 0, 4) },
      ];
      const s = spots[(Math.random() * spots.length) | 0];
      audio.say(`Attention night staff. Assistance required at ${s.label}.`, { voice: 'pa' });
      attendant.lastKnown.copy(s.pos);
      attendant.hasSeen = true;
      attendant.alert = 0.7;
      attendant.setState('investigate');
      ui.say(`You hear your own voice come out of the ceiling, a half-second behind you.`, 'note');
      notebook.clue('pa_lure', 'The PA mic sends him somewhere else. He always goes.', loop.loop);
      return;
    }

    // ---- diner ------------------------------------------------------------
    if (n === 'int_jukebox') {
      if (this.inv.coins < 1) { ui.say('It takes a coin.', 'note'); return; }
      this.inv.coins--;
      this.inv.jukeboxPlayed = true;
      audio.at(scene, 'coin', f.pos, { vol: 0.4, ref: 3, max: 14 });
      this.ctx.onJukebox?.(f.obj);
      ui.say('The arm drops. Something slow and badly out of tune starts up.', 'note');
      setTimeout(() => {
        if (!loop.running) return;
        audio.say('The 11:47 service is held for one passenger. One seat remains.', { voice: 'pa' });
        notebook.clue('juke_pa', 'The jukebox makes the PA read a held announcement. One seat remains.', loop.loop);
      }, 7000);
      noise(0.6);
      return;
    }
    if (n.startsWith('int_vending')) {
      if (this.inv.coins < 1) {
        audio.at(scene, 'clunk', f.pos, { vol: 0.8, ref: 4, max: 40, verb: 0.5 });
        ui.say('You push the flap. The whole cabinet bangs. That carried.', 'note');
        noise(0.8);
        return;
      }
      this.inv.coins--;
      this.taken.add(n);
      audio.at(scene, 'clunk', f.pos, { vol: 0.9, rate: 0.85, ref: 5, max: 44, verb: 0.5 });
      if (!this.inv.flashlight) {
        this.inv.flashlight = true;
        this.ctx.player.hasFlashlight = true;
        ui.say('A torch drops into the tray. Somebody stocked it with batteries, not sweets.', 'note');
        notebook.clue('flashlight', 'There is a torch in one of the vending machines.', loop.loop);
      } else {
        this.ctx.player.battery = Math.min(1, this.ctx.player.battery + 0.55);
        this.inv.coins++;   // it gives the coin back with the batteries
        ui.say('Batteries, and your coin returned. The machine is being kind.', 'note');
      }
      noise(0.85);
      return;
    }
    if (n === 'int_coffeepot') {
      ui.say('Still warm. It has been 1987 for a long time and the pot is still warm.', 'note');
      return;
    }

    // ---- Lost & Found -----------------------------------------------------
    if (n === 'int_transferslips') {
      const unheard = SLIPS.filter(s => s.echo && !this.inv.heardStories.includes(s.echo));
      ui.openSlips(SLIPS, this.inv, (slip) => {
        this.inv.slip = slip;
        ui.say(`You take ${slip.label}.`, 'note');
        this.ctx.notebook.clue('slips',
          'The transfer slip you punch decides where the bus takes you.', loop.loop);
      });
      return;
    }
    if (n.startsWith('int_shelf')) {
      const idx = Number(n.slice(-2)) - 1;
      const finds = [
        { echo: 'e01', text: 'A hatbox. Inside, a photograph of a coast road and a slip of paper.' },
        { echo: 'e02', text: 'A work coat, folded. The pocket has a transfer slip and a pay envelope.' },
        { echo: 'e03', text: 'A child’s satchel. A half-fare slip, and a note in an adult’s hand.' },
      ];
      const got = finds[idx % finds.length];
      if (!this.inv.heardStories.includes(got.echo)) {
        this.inv.heardStories.push(got.echo);
        notebook.echo(got.echo);
        this.ctx.onEchoStory?.(got.echo);
      }
      ui.say(got.text, 'note');
      notebook.clue('lostfound', 'Every passenger left one thing. Each thing is a story, and a clue.', loop.loop);
      noise(0.2);
      return;
    }

    // ---- baggage ----------------------------------------------------------
    if (n === 'int_conveyor') {
      audio.at(scene, 'knock', f.pos, { vol: 0.5, ref: 5, max: 30, verb: 0.4 });
      ui.say('The belt judders a few inches and stops. Something went round the bend.', 'note');
      noise(0.45);
      return;
    }
    if (n === 'int_lockerpanel') {
      if (this.inv.lockerOpen) { ui.say('Already open, and already empty.', 'note'); return; }
      ui.openKeypad(LOCKER_CODE, (ok) => {
        if (!ok) {
          audio.play('clunk', { vol: 0.5, rate: 1.6 });
          ui.say('The dial springs back. Wrong.', 'note');
          noise(0.4);
          return;
        }
        this.inv.lockerOpen = true;
        this.inv.punch = true;
        audio.play('clunk', { vol: 0.6, rate: 0.7 });
        audio.play('keys', { vol: 0.3, delay: 0.3 });
        ui.say('W, A, L, T. The locker opens. Inside: a conductor’s punch, '
             + 'and a cap with his name in the band.', 'note');
        notebook.clue('punch', 'The conductor’s punch was in locker 4. The dial spells WALT.', loop.loop);
        noise(0.5);
      });
      return;
    }

    // ---- lore --------------------------------------------------------------
    if (n === 'int_routemap') {
      ui.openSign('Regional routes', [
        'GRAYHOLLOW — PORT REYES — THE COAST',
        'GRAYHOLLOW — WINSLOW — ASHFORK',
        'GRAYHOLLOW — LUNDY CROSSING — TARN',
        'GRAYHOLLOW — BAY 0',
        '',
        'Three of these towns are not on any map printed after 1962.',
        'One of them is not a town.',
      ]);
      notebook.clue('bay0', 'The route map lists a Bay 0. There is no Bay 0 on the signs.', loop.loop);
      return;
    }
    if (n === 'int_bench_note') {
      ui.openSign('On the bench, in biro', [
        'If you are reading this you fell asleep somewhere',
        'you did not mean to stay.',
        '',
        'The rules are mostly true. Two of them are not.',
        'The restroom has the list.',
        '',
        'Do not answer the PA. Whatever it calls you.',
      ]);
      notebook.clue('bench_note', 'Someone left a note on the bench. Two rules are lies.', loop.loop);
      return;
    }
    if (n === 'int_trash_hall') {
      const bits = [
        'Timetables, torn in half. The destinations are towns you have never heard of.',
        'A newspaper clipping about a missing bus. The photograph is different to last time.',
        'Postcards, addressed to the passengers, stamped and never sent.',
      ];
      ui.say(bits[(Math.random() * bits.length) | 0], 'note');
      noise(0.2);
      return;
    }

    // ---- the bus ----------------------------------------------------------
    if (n === 'int_bus') {
      this.ctx.onBoard?.(this.ticketState());
      return;
    }

    ui.say('Nothing to do with it.', 'note');
  }

  _attendantCam() {
    const a = this.ctx.attendant.pos;
    if (a.z > -6) return 0;              // waiting hall
    if (a.z > -24 && Math.abs(a.x) < 7) return 1;   // concourse
    if (a.x < -6) return 2;              // baggage
    if (a.z < -24) return 3;             // bays
    return -1;
  }

  /** stow or show the stub, which rule four cares about between 1 and 2 */
  toggleTicket() {
    if (!this.inv.stub) { this.ctx.ui.say('You have nothing to stow.', 'note'); return; }
    this.inv.ticketOut = !this.inv.ticketOut;
    this.ctx.ui.say(this.inv.ticketOut
      ? 'You hold the stub where you can see it.'
      : 'You fold the stub away inside your coat.', 'note');
  }

  /** punch the slip, if you have both */
  punchSlip() {
    const { ui, audio, notebook, loop } = this.ctx;
    if (!this.inv.punch) { ui.say('You have nothing to punch it with.', 'note'); return false; }
    if (!this.inv.slip) { ui.say('You have no transfer slip.', 'note'); return false; }
    if (this.inv.punched) { ui.say('Already punched.', 'note'); return false; }
    this.inv.punched = true;
    audio.play('punch', { vol: 0.5, rate: 1.2 });
    ui.say('You punch the slip. A small clean hole, the shape of a crescent.', 'note');
    notebook.clue('punched', 'A punched slip plus a stamped stub is a valid ticket.', loop.loop);
    return true;
  }

  ticketState() {
    const i = this.inv;
    return {
      valid: i.stub && i.stamp && i.punched && !!i.slip,
      stub: i.stub, stamp: i.stamp, punched: i.punched, slip: i.slip,
      stories: i.heardStories.slice(),
    };
  }

  /** the HUD's right-hand column */
  carryLines() {
    const i = this.inv;
    const row = (on, label) => `<span class="${on ? 'on' : ''}">${on ? '■' : '□'} ${label}</span>`;
    const out = [];
    out.push(row(i.stub, i.ticketOut || !i.stub ? 'stub' : 'stub (stowed)'));
    out.push(row(i.stamp, 'stamp'));
    out.push(row(i.punched, i.slip ? 'transfer' : 'transfer'));
    if (i.coins) out.push(`<span class="on">● ${i.coins} coin${i.coins > 1 ? 's' : ''}</span>`);
    if (i.keyring) out.push('<span class="on">— keyring</span>');
    if (i.punch) out.push('<span class="on">— punch</span>');
    return out.join('<br>');
  }
}
