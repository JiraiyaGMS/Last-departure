/**
 * notebook.js — the only thing that survives a reset.
 *
 * Everything the player works out is written here automatically and kept in
 * localStorage, so it outlives both the loop and the browser tab. This is the
 * game's progression: the character resets, the notebook does not.
 */
const KEY = 'last-departure.notebook.v1';

const BLANK = () => ({
  name: '',
  loops: 0,
  clues: [],        // {id, text, loop}
  rules: [],        // {id, text, verdict:'real'|'fake'|'unknown'}
  codes: {},        // label -> value
  echoes: [],       // ids of passengers whose story you have heard
  endings: [],      // endings reached
  deaths: 0,
  bestTime: null,
});

export class Notebook {
  constructor() {
    this.data = BLANK();
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...BLANK(), ...JSON.parse(raw) };
    } catch { this.data = BLANK(); }
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch {}
  }
  wipe() { this.data = BLANK(); this.save(); }

  setName(n) { this.data.name = n; this.save(); }

  /** returns true the first time a clue is written */
  clue(id, text, loop = 0) {
    if (this.data.clues.some(c => c.id === id)) return false;
    this.data.clues.push({ id, text, loop });
    this.save();
    return true;
  }

  code(label, value) {
    if (this.data.codes[label] === value) return false;
    this.data.codes[label] = value;
    this.save();
    return true;
  }

  rule(id, text, verdict) {
    const found = this.data.rules.find(r => r.id === id);
    if (found) {
      if (found.verdict === verdict) return false;
      found.verdict = verdict;
    } else {
      this.data.rules.push({ id, text, verdict });
    }
    this.save();
    return true;
  }

  echo(id) {
    if (this.data.echoes.includes(id)) return false;
    this.data.echoes.push(id); this.save(); return true;
  }

  ending(id) {
    if (this.data.endings.includes(id)) return false;
    this.data.endings.push(id); this.save(); return true;
  }

  died() { this.data.deaths++; this.data.loops++; this.save(); }

  knows(id) { return this.data.clues.some(c => c.id === id); }
  get hasAny() { return this.data.clues.length || this.data.rules.length; }
}
