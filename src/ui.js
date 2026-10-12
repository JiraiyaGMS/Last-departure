/**
 * ui.js — the HUD, the subtitles, and every panel you can read.
 *
 * Panels are modal: while one is open the clock keeps running and the Attendant
 * keeps walking, but the player cannot move. Reading the night log while he is
 * two rooms away and closing is meant to be a decision, not a pause.
 */
const $ = s => document.querySelector(s);

export class UI {
  constructor({ onClose } = {}) {
    this.el = {
      prompt: $('#prompt'), clock: $('#clock'), loopn: $('#loopn'), carry: $('#carry'),
      subs: $('#subs'), breath: $('#breath'), breathBar: $('#breath > i'),
      batt: $('#batt'), battBar: $('#batt > i'),
      notebook: $('#notebook'), notebookSheet: $('#notebookSheet'),
      sign: $('#sign'), signSheet: $('#signSheet'),
      pause: $('#pause'), black: $('#black'), wake: $('#wake'), wakeText: $('#wakeText'),
      vig: $('#vig'), near: $('#near'), reticle: $('#reticle'),
    };
    this.modal = null;          // 'notebook' | 'sign' | null
    this.subs = [];
    this.subsOn = true;
    this._onClose = onClose || (() => {});
    this._keyHandler = null;
    this._answerUntil = 0;
    this._answerCb = null;
    this._nearTimer = 0;
  }

  // ── subtitles ─────────────────────────────────────────────────────────────

  say(text, cls = '') {
    if (!this.subsOn && cls !== 'note') return;
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    this.el.subs.appendChild(d);
    this.subs.push({ el: d, until: performance.now() + 2200 + text.length * 48 });
    while (this.subs.length > 3) {
      const old = this.subs.shift();
      old.el.remove();
    }
  }

  tickSubs(now) {
    for (let i = this.subs.length - 1; i >= 0; i--) {
      if (now > this.subs[i].until) {
        this.subs[i].el.remove();
        this.subs.splice(i, 1);
      }
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  setPrompt(html) {
    this.el.prompt.innerHTML = html || '';
    this.el.prompt.style.opacity = html ? '1' : '0';
  }
  setClock(s) { this.el.clock.textContent = s; }
  setLoop(n) { this.el.loopn.textContent = `Loop ${n}`; }
  setCarry(html) { this.el.carry.innerHTML = html; }

  setBreath(v, show) {
    this.el.breath.style.opacity = show ? '1' : '0';
    this.el.breathBar.style.width = `${Math.max(0, v * 100)}%`;
    this.el.breathBar.style.background = v < 0.3 ? '#b2532a' : '#cfd3c4';
  }
  setBattery(v, show) {
    this.el.batt.style.opacity = show ? '1' : '0';
    this.el.battBar.style.width = `${Math.max(0, v * 100)}%`;
  }
  setFear(f) {
    this.el.vig.style.opacity = String(0.45 + f * 0.4);
    this.el.near.style.opacity = String(Math.max(f * 0.85, this._nearHold || 0));
    this.el.reticle.style.opacity = f > 0.75 ? '0' : '0.5';
  }
  pulseNear(amount = 1, ms = 1200) {
    this._nearHold = amount;
    clearTimeout(this._nearTimer);
    this._nearTimer = setTimeout(() => { this._nearHold = 0; }, ms);
  }
  flashBoard() { /* the board panel picks this up as a glitch flag */ this._boardGlitch = 0.5; }

  // ── blackout / wake ───────────────────────────────────────────────────────

  fade(to, ms = 180) {
    this.el.black.style.transition = `opacity ${ms}ms`;
    this.el.black.style.opacity = String(to);
  }

  async wakeSequence(lines, { hold = 2600 } = {}) {
    this.el.wakeText.innerHTML = lines.map((l, i) =>
      i === 0 ? l : `<b>${l}</b>`).join('<br>');
    this.el.wake.style.transition = 'opacity 600ms';
    this.el.wake.style.opacity = '1';
    await new Promise(r => setTimeout(r, hold));
    this.el.wake.style.opacity = '0';
    await new Promise(r => setTimeout(r, 650));
  }

  // ── the answer prompt for the PA name call ────────────────────────────────

  /**
   * The PA has used the player's name. Offer the key that answers it, because a
   * rule you cannot break is not a rule. Pressing Y here is how you learn the
   * sign meant it.
   */
  offerAnswer(seconds, cb) {
    this._answerUntil = performance.now() + seconds * 1000;
    this._answerCb = cb;
    this.setPrompt('<b>Y</b> answer');
  }
  get answerOpen() { return performance.now() < this._answerUntil; }
  takeAnswer() {
    if (!this.answerOpen) return false;
    this._answerUntil = 0;
    this._answerCb?.();
    return true;
  }

  // ── panels ────────────────────────────────────────────────────────────────

  _open(which, html, keyHandler = null) {
    this.modal = which;
    const panel = which === 'notebook' ? this.el.notebook : this.el.sign;
    const sheet = which === 'notebook' ? this.el.notebookSheet : this.el.signSheet;
    sheet.innerHTML = html;
    panel.classList.add('show');
    document.exitPointerLock?.();
    this._keyHandler = keyHandler;
  }

  close() {
    if (!this.modal) return false;
    this.el.notebook.classList.remove('show');
    this.el.sign.classList.remove('show');
    this.modal = null;
    this._keyHandler = null;
    this._onClose();
    return true;
  }

  /** returns true if the panel consumed the key */
  key(e) {
    if (!this.modal) return false;
    if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyE') { this.close(); return true; }
    if (this._keyHandler) return !!this._keyHandler(e);
    return true;
  }

  openSign(title, lines, opts = {}) {
    const cls = opts.hand ? 'hand' : '';
    const marked = (txt) => {
      if (!opts.marks) return txt;
      const r = opts.marks.active.find(x => x.text === txt);
      return r && !r.real ? `<span class="struck">${txt}</span>` : txt;
    };
    const body = lines.map(l => l === ''
      ? '<li style="list-style:none;height:6px"></li>'
      : `<li class="${cls}">${marked(l)}</li>`).join('');
    this._open('sign', `
      <h2>${title}</h2>
      ${opts.note ? `<p class="sub">${opts.note}</p>` : '<p class="sub">Esc to look away</p>'}
      <ul>${body}</ul>
      <p class="foot">Grayhollow Transit Center</p>`);
  }

  openBoard(rows, loop) {
    const g = this._boardGlitch > 0;
    this._boardGlitch = 0;
    const r = rows.map(x => {
      const cnx = x.status === 'CANCELLED';
      const col = cnx ? '#b2532a' : x.status === 'DEPARTED' ? '#5f6a53' : '#9fd356';
      const dest = cnx ? `<b style="color:#b2532a">${x.dest[0]}</b>${x.dest.slice(1)}` : x.dest;
      return `<tr style="color:${col}">
        <td style="padding:4px 14px 4px 0">${dest.toUpperCase()}</td>
        <td style="padding:4px 14px 4px 0">${x.bay}</td>
        <td style="padding:4px 14px 4px 0">${x.time}</td>
        <td style="padding:4px 0">${x.status}</td></tr>`;
    }).join('');
    this._open('sign', `
      <h2>Departures</h2>
      <p class="sub">${loop.timeString} &middot; ${g ? 'the flaps are still turning over' : 'Esc to look away'}</p>
      <table style="width:100%;font-size:13px;border-collapse:collapse">
        <tr style="color:#5f6a53;font-size:10px;letter-spacing:.2em">
          <td>DESTINATION</td><td>BAY</td><td>TIME</td><td>STATUS</td></tr>
        ${r}
      </table>
      <h3>Rule three</h3>
      <ul><li>Do not look at this board for longer than ten seconds.</li></ul>
      <p class="foot">the cancelled ones were cancelled in 1987</p>`);
  }

  openCCTV(loop, { ghost = 0, attendantCam = -1 } = {}) {
    const cams = ['01 Waiting Hall', '02 Concourse', '03 Baggage Claim', '04 Bay 9'];
    const cells = cams.map((c, i) => {
      let body = '<span style="color:#3c4436">— nothing —</span>';
      if (i === attendantCam) body = '<span style="color:#cfd3c4">a tall figure, standing still</span>';
      if (i === 3 && ghost > 0.2) {
        body = `<span style="color:#b2532a">something in the frame.<br>
                it is too tall for the doorway behind it</span>`;
      }
      return `<div style="border:1px solid #1d221a;padding:12px;background:#0a0f08">
        <div style="font-size:9px;letter-spacing:.2em;color:#6f8f5f;margin-bottom:8px">
          CAM ${c.toUpperCase()}</div>
        <div style="font-size:11px;line-height:1.6;min-height:38px">${body}</div></div>`;
    }).join('');
    this._open('sign', `
      <h2>Security</h2>
      <p class="sub">${loop.timeString} &middot; four cameras, one of them lying</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${cells}</div>
      ${ghost > 0.2 ? `<h3>Camera 4</h3><ul>
        <li>It is nearer than it was last loop.</li>
        <li>Walter's log: <i>do not let it take a ticket.</i></li></ul>` : ''}
      <p class="foot">Esc to look away</p>`);
  }

  openSlips(slips, inv, pick) {
    const rows = slips.map((s, i) => {
      const heard = s.echo ? inv.heardStories.includes(s.echo) : true;
      const tag = s.echo
        ? (heard ? '<span style="color:#9fd356">you know this one’s story</span>'
                 : '<span style="color:#b2532a">you have not heard their story</span>')
        : '<span style="color:#8fa6b8">no name, no destination</span>';
      const mine = inv.slip?.id === s.id;
      return `<li style="margin-bottom:10px">
        <b style="color:${mine ? '#9fd356' : '#cfd3c4'}">${i + 1}</b> &nbsp;${s.label}
        ${mine ? ' &nbsp;<span style="color:#9fd356">(taken)</span>' : ''}
        <div style="font-size:11px;color:#6b7560;margin-left:20px">${tag}</div></li>`;
    }).join('');
    this._open('sign', `
      <h2>Transfer slips</h2>
      <p class="sub">press 1&ndash;${slips.length} to take one &middot; Esc to leave them</p>
      <ul style="list-style:none;padding-left:0">${rows}</ul>
      <h3>Walter's log, undated</h3>
      <ul><li>Using a passenger's slip without hearing their story sends you
        where they went.</li></ul>
      <p class="foot">the slip decides the destination</p>`, (e) => {
        const n = Number(e.key);
        if (n >= 1 && n <= slips.length) {
          pick(slips[n - 1]);
          this.close();
          return true;
        }
        return false;
      });
  }

  openKeypad(answer, done) {
    let entry = '';
    const render = () => {
      const slots = Array.from({ length: answer.length },
        (_, i) => `<span style="display:inline-block;width:34px;height:44px;line-height:44px;
          border:1px solid #2a3320;margin-right:8px;text-align:center;font-size:20px;
          color:#9fd356;background:#0a0d08">${entry[i] || ''}</span>`).join('');
      const sheet = this.el.signSheet;
      sheet.innerHTML = `
        <h2>Locker dial</h2>
        <p class="sub">four letters &middot; type them &middot; Backspace to clear &middot; Enter to try</p>
        <div style="margin:22px 0 8px">${slots}</div>
        <h3>Scratched into the metal</h3>
        <ul><li>the ones that never left</li></ul>
        <p class="foot">Esc to step away</p>`;
    };
    this._open('sign', '', (e) => {
      if (e.code === 'Backspace') { entry = entry.slice(0, -1); render(); return true; }
      if (e.code === 'Enter') {
        const ok = entry.toUpperCase() === answer.toUpperCase();
        this.close();
        done(ok);
        return true;
      }
      if (/^[a-zA-Z]$/.test(e.key) && entry.length < answer.length) {
        entry += e.key.toUpperCase();
        render();
        if (entry.length === answer.length) {
          // let them see the fourth letter land before it resolves
          setTimeout(() => {
            if (this.modal !== 'sign') return;
            const ok = entry.toUpperCase() === answer.toUpperCase();
            this.close(); done(ok);
          }, 420);
        }
        return true;
      }
      return false;
    });
    render();
  }

  openNotebook(nb, loop) {
    const d = nb.data;
    const clues = d.clues.length
      ? d.clues.map(c => `<li>${c.text} <span style="color:#4e5745">— loop ${c.loop || 1}</span></li>`).join('')
      : '<li class="empty">Nothing yet. You have only just woken up.</li>';
    const rules = d.rules.length
      ? d.rules.map(r => {
          const v = r.verdict === 'real' ? '<span style="color:#9fd356">TRUE</span>'
                  : r.verdict === 'fake' ? '<span style="color:#b2532a">A LIE</span>'
                  : '<span style="color:#6b7560">unverified</span>';
          return `<li class="${r.verdict === 'fake' ? 'struck' : ''}">${r.text} &nbsp;${v}</li>`;
        }).join('')
      : '<li class="empty">You have not read a sign closely enough.</li>';
    const codes = Object.keys(d.codes).length
      ? Object.entries(d.codes).map(([k, v]) =>
          `<li>${k}: <b style="color:#9fd356;letter-spacing:.3em">${v}</b></li>`).join('')
      : '<li class="empty">No codes.</li>';
    const ech = d.echoes.length
      ? `<li>${d.echoes.length} of 14 passengers' stories heard.</li>`
      : '<li class="empty">You have not returned anything to anyone.</li>';
    const ends = d.endings.length
      ? d.endings.map(e => `<li>${e}</li>`).join('')
      : '<li class="empty">You have not left.</li>';

    this._open('notebook', `
      <h2>Notebook</h2>
      <p class="sub">${d.name || 'unnamed'} &middot; loop ${loop.loop} &middot;
        ${d.deaths} reset${d.deaths === 1 ? '' : 's'} &middot; it survives the bench</p>
      <h3>What I know</h3><ul>${clues}</ul>
      <h3>The rules</h3><ul>${rules}</ul>
      <h3>Codes</h3><ul>${codes}</ul>
      <h3>Passengers</h3><ul>${ech}</ul>
      <h3>Departures taken</h3><ul>${ends}</ul>
      <p class="foot">Tab or Esc to close</p>`);
  }

  showPause(on) { this.el.pause.classList.toggle('show', on); }
}
