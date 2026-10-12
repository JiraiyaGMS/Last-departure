/**
 * loop.js — the night, on a schedule.
 *
 * 11:47 PM to 3:33 AM runs at 14x, so a full loop is a little over sixteen real
 * minutes, inside the fifteen-to-twenty the doc asks for. Events are declared
 * against clock times and fire once each as the hand passes them, so the loop is
 * a timetable the player can learn by heart — which is the point. Knowing what
 * happens at 2:14 and still having to be there is worse than a surprise.
 */

export const START_MIN = 23 * 60 + 47;   // 11:47 PM
export const END_MIN   = 27 * 60 + 33;   // 3:33 AM, counted past midnight
export const RATE      = 14;             // game seconds per real second

export function parseTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  let t = h * 60 + m;
  while (t < START_MIN) t += 1440;
  return t;
}

export function fmt(min) {
  const t = ((Math.floor(min) % 1440) + 1440) % 1440;
  const h24 = Math.floor(t / 60), m = t % 60;
  const ap = h24 >= 12 ? 'PM' : 'AM';
  let h = h24 % 12; if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

export class GameLoop {
  constructor({ onEvent, onReset, onExpire } = {}) {
    this.min = START_MIN;
    this.loop = 1;
    this.fired = new Set();
    this.events = [];
    this.running = false;
    this.expired = false;
    this._onEvent = onEvent || (() => {});
    this._onReset = onReset || (() => {});
    this._onExpire = onExpire || (() => {});
  }

  /** `at` is 'HH:MM'; `id` must be unique; `once` events fire once per loop */
  on(at, id, data = {}) {
    this.events.push({ t: parseTime(at), at, id, data });
    this.events.sort((a, b) => a.t - b.t);
    return this;
  }

  start() { this.running = true; }
  pause() { this.running = false; }

  get progress() { return (this.min - START_MIN) / (END_MIN - START_MIN); }
  get timeString() { return fmt(this.min); }
  /** minutes of game time remaining */
  get remaining() { return Math.max(0, END_MIN - this.min); }

  update(dt) {
    if (!this.running || this.expired) return;
    const prev = this.min;
    this.min += (dt * RATE) / 60;

    for (const e of this.events) {
      if (e.t > prev && e.t <= this.min && !this.fired.has(e.id)) {
        this.fired.add(e.id);
        this._onEvent(e);
      }
    }

    if (this.min >= END_MIN) {
      this.expired = true;
      this._onExpire();
    }
  }

  /** a new loop. The notebook is the player's; everything else goes back. */
  reset(reason = 'caught') {
    this.loop += 1;
    this.min = START_MIN;
    this.fired.clear();
    this.expired = false;
    this._onReset(reason, this.loop);
  }

  /** has this time already gone by this loop? */
  past(hhmm) { return this.min >= parseTime(hhmm); }
}
