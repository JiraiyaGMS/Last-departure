/**
 * rules.js — the Station Rules, the signature mechanic.
 *
 * Each rule carries its own text, a window it applies in, and a check. Signs
 * render straight from this list, so changing a rule changes the sign. Some rules
 * are real and some were planted by something else in the building; the
 * handwritten sign in the restroom names the fakes, and a fake rule punishes you
 * for *obeying* it.
 *
 * Breaking a real rule reports the player to the Attendant immediately. That is
 * what makes a posted sign frightening rather than decorative.
 */

/** Rules the station posts. `real:false` ones are traps. */
export const POSTED = [
  {
    id: 'no_running',
    text: 'Do not run inside the terminal.',
    real: true,
    window: null,
    hint: 'He hears it from anywhere. Walk.',
    check: (p) => p.running && p.grounded && p.speed > 3.2,
  },
  {
    id: 'no_answer_pa',
    text: 'If the PA system calls your name, do not answer.',
    real: true,
    window: null,
    hint: 'Answering is the Y key. Never press it.',
    check: (p, s) => s.answeredPA,
  },
  {
    id: 'board_10s',
    text: 'Do not look at the departure board for longer than ten seconds.',
    real: true,
    window: null,
    hint: 'Look away before the tenth second. It counts.',
    check: (p, s) => s.boardStare > 10,
  },
  {
    id: 'ticket_hidden',
    text: 'Keep your ticket out of sight between 1:00 and 2:00 AM.',
    real: true,
    window: ['01:00', '02:00'],
    hint: 'Between one and two, stow it. Q puts it away.',
    check: (p, s) => s.ticketOut,
  },
  {
    id: 'say_1147',
    text: 'If a passenger asks you for the time, tell them it is 11:47.',
    real: false,                      // a trap. Telling them extends their wait.
    window: null,
    hint: 'HANDWRITTEN: this one is a lie. Say nothing to them.',
    check: (p, s) => s.toldTime,
  },
  {
    id: 'no_lights_off',
    text: 'Do not switch off any light that is working.',
    real: false,                      // a trap. The dark is the only safe thing.
    window: null,
    hint: 'HANDWRITTEN: darkness is not the danger here.',
    check: (p, s) => s.killedLight,
  },
  {
    id: 'stay_seated_2',
    text: 'Remain seated during the 2:00 AM announcement.',
    real: true,
    window: ['02:00', '02:04'],
    hint: 'Be on a bench at two, or hidden. Not standing.',
    check: (p, s, l) => l.past('02:00') && !l.past('02:04') && !p.hiding && p.moving,
  },
];

/** the handwritten sign in the restroom; it contradicts exactly the fake rules */
export function handwrittenLines() {
  const fakes = POSTED.filter(r => !r.real);
  return [
    'Walter — the sign lies.',
    ...fakes.map(r => `NOT TRUE: ${r.text}`),
    'The mirror has the real ones after 2.',
  ];
}

export class RuleBook {
  constructor(loop, { onBreak } = {}) {
    this.loop = loop;
    this.active = POSTED.slice();
    this.broken = new Set();
    this._onBreak = onBreak || (() => {});
    // transient state the checks read
    this.s = {
      answeredPA: false, boardStare: 0, ticketOut: false,
      toldTime: false, killedLight: false,
    };
    this._cool = 0;
  }

  /** shuffle which rules are posted, per the doc's "rules change between loops" */
  reshuffle(loopNumber) {
    const base = POSTED.filter(r => ['no_running', 'no_answer_pa'].includes(r.id));
    const rest = POSTED.filter(r => !base.includes(r));
    // deterministic per loop so a player can learn a loop and come back to it
    let seed = loopNumber * 2654435761 % 2147483647;
    const rnd = () => (seed = seed * 48271 % 2147483647) / 2147483647;
    rest.sort(() => rnd() - 0.5);
    const take = 3 + Math.floor(rnd() * 2);
    this.active = base.concat(rest.slice(0, take));
    this.broken.clear();
    this.clearTransient();
  }

  clearTransient() {
    this.s.answeredPA = false;
    this.s.boardStare = 0;
    this.s.ticketOut = false;
    this.s.toldTime = false;
    this.s.killedLight = false;
  }

  isActive(rule) {
    if (!rule.window) return true;
    const [a, b] = rule.window;
    return this.loop.past(a) && !this.loop.past(b);
  }

  /** the lines a sign shows right now */
  signLines() {
    return this.active.map(r => r.text);
  }

  update(dt, player) {
    this._cool = Math.max(0, this._cool - dt);
    for (const r of this.active) {
      if (!this.isActive(r)) continue;
      let hit = false;
      try { hit = !!r.check(player, this.s, this.loop); } catch { hit = false; }
      if (!hit) continue;

      // a real rule reports you. A fake one quietly costs you something else.
      if (r.real) {
        if (this._cool > 0) continue;
        this._cool = 2.5;
        this.broken.add(r.id);
        this._onBreak(r, true);
      } else if (!this.broken.has(r.id)) {
        this.broken.add(r.id);
        this._onBreak(r, false);
      }
    }
    // the stare timer decays when you look away
    this.s.boardStare = Math.max(0, this.s.boardStare - dt * 1.4);
  }
}
