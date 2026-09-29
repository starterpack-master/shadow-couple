import { MEMORIES } from './photos.js';
import { CHAPTERS } from './levels.js';

const $ = (s) => document.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 한국어 조사: 받침 유무에 따라
function hasBatchim(word) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}
const JOSA = { 아: ['아', '야'], 은: ['은', '는'], 이: ['이', '가'], 을: ['을', '를'], 과: ['과', '와'], 이야: ['이야', '야'], 으로: ['으로', '로'] };

export class UI {
  constructor(game) {
    this.g = game;
    this.auto = false;
    this.names = { A: '해솔', B: '다온' };
    this.dialog = $('#dialog');
    this.dSpeaker = this.dialog.querySelector('.speaker');
    this.dText = this.dialog.querySelector('.text');
    this.toastEl = $('#toast');
    this.fadeEl = $('#fade');
    this.advance = null;
    const tap = (e) => { e.preventDefault(); this.tapDialog(); };
    this.dialog.querySelector('.catch').addEventListener('touchstart', tap, { passive: false });
    this.dialog.querySelector('.catch').addEventListener('mousedown', tap);
    this.photoEl = $('#photo');
    this.narrEl = $('#narr');
    this.cardEl = $('#card');
  }

  fmt(t) {
    return t.replace(/\{(A|B)(?::([^}]+))?\}/g, (_, who, j) => {
      const n = this.names[who];
      if (!j) return n;
      const pair = JOSA[j];
      if (!pair) return n + j;
      return n + (hasBatchim(n) ? pair[0] : pair[1]);
    });
  }

  // ------------------------------------------------------------ dialog
  speakerInfo(who) {
    switch (who) {
      case 'moth': return ['나방', 'sp-moth', ''];
      case 'A': return [this.names.A, 'sp-A', ''];
      case 'B': return [this.names.B, 'sp-B', ''];
      case 'shade': return ['그림자', 'sp-shade', ''];
      case 'shadeVoice': return ['그림자', 'sp-shade', ''];
      case 'shadePen': return ['그림자', 'sp-shade', 'pen'];
      case 'sys': return ['안내', 'sp-sys', ''];
      default: return ['', '', 'narr'];
    }
  }
  say(who, text) {
    const [name, cls, mode] = this.speakerInfo(who);
    const full = this.fmt(text);
    const D = this.dialog;
    D.classList.remove('hidden', 'done', 'pen', 'narr');
    if (mode) D.classList.add(mode);
    this.dSpeaker.textContent = name;
    this.dSpeaker.className = 'speaker ' + cls;
    this.dText.textContent = '';
    const box = D.querySelector('.box');
    box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
    return new Promise((resolve) => {
      let i = 0, done = false;
      const speed = mode === 'pen' ? 16 : 40;
      const start = performance.now();
      const finish = () => { done = true; this.dText.textContent = full; D.classList.add('done'); };
      const tick = () => {
        if (done) return;
        const n = Math.min(full.length, Math.floor(((performance.now() - start) / 1000) * speed) + 1);
        if (n !== i) {
          i = n; this.dText.textContent = full.slice(0, i);
          if (i % 3 === 0) this.g.audio.play('type');
        }
        if (i >= full.length) finish(); else requestAnimationFrame(tick);
      };
      tick();
      this.advance = () => {
        if (!done) { finish(); return; }
        this.advance = null;
        D.classList.add('hidden');
        this.g.audio.play('tap');
        resolve();
      };
      if (this.auto) setTimeout(() => { finish(); this.advance && this.advance(); }, 20);
    });
  }
  tapDialog() {
    if (this.advance) this.advance();
  }
  hideDialog() { this.dialog.classList.add('hidden'); }

  // ------------------------------------------------------------ choices
  // who: 0(1P) | 1(2P) | 'both' ; opts: 배열 또는 [opts0, opts1]
  choose(who, opts, prompt, sub) {
    const el = $('#choice');
    el.classList.remove('hidden');
    el.querySelector('.prompt').innerHTML = this.fmt(prompt || '') + (sub ? `<small>${sub}</small>` : '');
    const halves = [el.querySelector('.half.left'), el.querySelector('.half.right')];
    const both = who === 'both';
    const res = [null, null];
    return new Promise((resolve) => {
      halves.forEach((h, i) => {
        h.classList.remove('off', 'locked');
        const box = h.querySelector('.opts');
        box.innerHTML = '';
        h.querySelector('.who').textContent = i === 0 ? `1P · ${this.names.A}` : '2P · 그림자';
        const active = both || who === i;
        if (!active) { h.classList.add('off'); return; }
        const list = both ? opts[i] : opts;
        list.forEach((t, k) => {
          const b = document.createElement('button');
          b.textContent = this.fmt(t);
          const pick = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (res[i] !== null) return;
            res[i] = k; b.classList.add('sel'); h.classList.add('locked');
            this.g.audio.play('choice');
            if (!both || (res[0] !== null && res[1] !== null)) {
              this.choiceKey = null;
              setTimeout(() => { el.classList.add('hidden'); resolve(both ? res : k); }, both ? 650 : 250);
            }
          };
          b.addEventListener('touchstart', pick, { passive: false });
          b.addEventListener('click', pick);
          box.appendChild(b);
        });
      });
      // 키보드: 1P 1/2/3, 2P 8/9/0
      this.choiceKey = (code) => {
        const m0 = { Digit1: 0, Digit2: 1, Digit3: 2 }, m1 = { Digit8: 0, Digit9: 1, Digit0: 2 };
        for (const [i, m] of [[0, m0], [1, m1]]) {
          if (m[code] === undefined) continue;
          const h = halves[i];
          if (h.classList.contains('off')) continue;
          const b = h.querySelectorAll('button')[m[code]];
          if (b) b.click();
        }
      };
      if (this.auto) {
        setTimeout(() => {
          halves.forEach((h) => { if (!h.classList.contains('off')) { const b = h.querySelector('button'); if (b) b.click(); } });
        }, 30);
      }
    });
  }

  // ------------------------------------------------------------ hold hands
  hold(prompt, sub) {
    const el = $('#hold');
    el.classList.remove('hidden');
    el.querySelector('.prompt').innerHTML = `${prompt}<small>${sub || ''}</small>`;
    const pads = [el.querySelector('.pad.left'), el.querySelector('.pad.right')];
    pads[0].querySelector('small').textContent = this.names.A;
    pads[1].querySelector('small').textContent = '그림자';
    const ring = el.querySelector('.ring');
    const held = [new Set(), new Set()];
    let p = 0, last = performance.now(), beatT = 0;
    return new Promise((resolve) => {
      const on = (i, id) => (e) => { e.preventDefault(); held[i].add(id ?? 'm'); pads[i].classList.add('on'); };
      const offAll = (e) => {
        for (let i = 0; i < 2; i++) {
          if (e.changedTouches) for (const t of e.changedTouches) held[i].delete(t.identifier);
          else held[i].delete('m');
          if (!held[i].size) pads[i].classList.remove('on');
        }
      };
      const handlers = pads.map((pad, i) => {
        const ts = (e) => { e.preventDefault(); for (const t of e.changedTouches) held[i].add(t.identifier); pad.classList.add('on'); };
        const md = on(i, 'm' + i);
        pad.addEventListener('touchstart', ts, { passive: false });
        pad.addEventListener('mousedown', md);
        return { pad, ts, md };
      });
      const mu = () => { for (let i = 0; i < 2; i++) { held[i].delete('m' + i); if (!held[i].size) pads[i].classList.remove('on'); } };
      window.addEventListener('touchend', offAll); window.addEventListener('touchcancel', offAll); window.addEventListener('mouseup', mu);
      const loop = () => {
        const now = performance.now(), dt = (now - last) / 1000; last = now;
        const I = this.g.input;
        const k0 = held[0].size > 0 || I.held(0, 'a') || I.held(0, 'b');
        const k1 = held[1].size > 0 || I.held(1, 'a');
        pads[0].classList.toggle('on', k0); pads[1].classList.toggle('on', k1);
        if ((k0 && k1) || this.auto) {
          p = Math.min(1, p + dt / 1.6);
          beatT -= dt;
          if (beatT <= 0) { beatT = 0.8; this.g.audio.play('heart'); if (navigator.vibrate) navigator.vibrate(30); }
        } else p = Math.max(0, p - dt * 0.8);
        ring.style.setProperty('--p', (p * 100).toFixed(1) + '%');
        if (p >= 1) {
          window.removeEventListener('touchend', offAll); window.removeEventListener('touchcancel', offAll); window.removeEventListener('mouseup', mu);
          handlers.forEach(({ pad, ts, md }) => { pad.removeEventListener('touchstart', ts); pad.removeEventListener('mousedown', md); });
          this.g.audio.play('match');
          setTimeout(() => { el.classList.add('hidden'); resolve(); }, 400);
          return;
        }
        requestAnimationFrame(loop);
      };
      loop();
    });
  }

  // ------------------------------------------------------------ photo
  photo(id) {
    const M = MEMORIES[id];
    const el = this.photoEl;
    el.querySelector('.pic').innerHTML = M.svg();
    el.querySelector('.ptitle').textContent = M.title;
    el.querySelector('.pcap').textContent = this.fmt(M.caption);
    el.classList.toggle('torn', !!M.torn);
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.add('on'));
    this.g.audio.play('memory');
    return new Promise((resolve) => {
      const t0 = performance.now();
      const close = (e) => {
        e && e.preventDefault();
        if (performance.now() - t0 < 900 && !this.auto) return;
        el.removeEventListener('touchstart', close); el.removeEventListener('mousedown', close);
        this.advance = null;
        el.classList.remove('on');
        setTimeout(() => { el.classList.add('hidden'); resolve(); }, 350);
      };
      el.addEventListener('touchstart', close, { passive: false });
      el.addEventListener('mousedown', close);
      this.advance = () => close();
      if (this.auto) setTimeout(close, 30);
    });
  }

  // ------------------------------------------------------------ narration / card
  async narrate(lines, opts = {}) {
    const el = this.narrEl;
    const box = el.querySelector('.lines');
    box.innerHTML = '';
    el.classList.remove('hidden');
    el.style.background = opts.bg || '#030205';
    for (const ln of lines) {
      const d = document.createElement('div');
      d.textContent = this.fmt(ln).replace(/^~/, '');
      if (ln.startsWith('~')) d.classList.add('pen');
      d.style.whiteSpace = 'pre-line';
      box.appendChild(d);
      await wait(30);
      d.classList.add('on');
      await this.waitTap(this.auto ? 20 : 1400);
    }
    await wait(this.auto ? 10 : 300);
    el.classList.add('hidden');
  }
  waitTap(minMs) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      let ready = false;
      setTimeout(() => { ready = true; if (this.auto) finish(); }, minMs);
      const finish = () => {
        window.removeEventListener('touchstart', h); window.removeEventListener('mousedown', h);
        this.advance = null; resolve();
      };
      const h = () => { if (ready || performance.now() - t0 > minMs) finish(); };
      window.addEventListener('touchstart', h); window.addEventListener('mousedown', h);
      this.advance = h;
    });
  }
  async card(ch) {
    const C = CHAPTERS[ch];
    const el = this.cardEl;
    el.querySelector('.small').textContent = `CHAPTER ${ch}`;
    el.querySelector('.big').textContent = C.title;
    el.querySelector('.sub').textContent = C.sub;
    el.classList.remove('hidden');
    this.g.audio.play('card');
    await wait(this.auto ? 20 : 2400);
    el.style.transition = 'opacity .8s'; el.style.opacity = '0';
    await wait(this.auto ? 10 : 800);
    el.classList.add('hidden'); el.style.opacity = ''; el.style.transition = '';
  }

  // ------------------------------------------------------------ misc
  toast(html, dur = 2600) {
    const t = this.toastEl;
    t.innerHTML = this.fmt(html);
    t.classList.add('on');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('on'), dur);
  }
  fade(to, ms = 800, white = false) {
    const f = this.fadeEl;
    f.classList.toggle('white', white);
    f.style.transition = `opacity ${ms}ms ease`;
    f.style.opacity = String(to);
    return wait(this.auto ? 10 : ms);
  }
  flash(strength = 0.8) {
    const f = $('#flash');
    f.style.transition = 'none'; f.style.opacity = String(strength);
    requestAnimationFrame(() => { f.style.transition = 'opacity .5s ease'; f.style.opacity = '0'; });
  }
}
