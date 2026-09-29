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
    this.tapSink = null; // 참가자 폰: 탭을 방장에게 전달
    const tap = (e) => { e.preventDefault(); this.tapDialog(); };
    this.dialog.querySelector('.catch').addEventListener('touchstart', tap, { passive: false });
    this.dialog.querySelector('.catch').addEventListener('mousedown', tap);
    this.photoEl = $('#photo');
    this.narrEl = $('#narr');
    this.cardEl = $('#card');
    const ptap = (e) => { e.preventDefault(); this.tapDialog(); };
    this.photoEl.addEventListener('touchstart', ptap, { passive: false });
    this.photoEl.addEventListener('mousedown', ptap);
    this.narrEl.addEventListener('touchstart', ptap, { passive: false });
    this.narrEl.addEventListener('mousedown', ptap);
  }

  fmt(t) {
    return String(t).replace(/\{(A|B)(?::([^}]+))?\}/g, (_, who, j) => {
      const n = this.names[who];
      if (!j) return n;
      const pair = JOSA[j];
      if (!pair) return n + j;
      return n + (hasBatchim(n) ? pair[0] : pair[1]);
    });
  }
  roleLabel(role) { return role === 0 ? `🏮 ${this.names.A}` : '🌑 그림자'; }

  // ------------------------------------------------------------ tap routing
  tapDialog() {
    if (this.advance) this.advance();
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
    if (this.sayResolve) { this.sayResolve(); this.sayResolve = null; }
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
      const close = () => {
        this.advance = null; this.sayResolve = null;
        D.classList.add('hidden');
        this.g.audio.play('tap');
        resolve();
      };
      this.sayResolve = close;
      this.advance = () => {
        if (this.tapSink) { if (!done) finish(); this.tapSink(); return; }
        if (!done) { finish(); return; }
        close();
      };
      if (this.auto && !this.tapSink) setTimeout(() => { finish(); this.advance && this.advance(); }, 20);
    });
  }
  closeDialog() { if (this.sayResolve) this.sayResolve(); this.dialog.classList.add('hidden'); }
  hideDialog() { this.dialog.classList.add('hidden'); }

  // ------------------------------------------------------------ choices (한 폰: 왼쪽/오른쪽 반씩)
  choose(who, opts, prompt, sub) {
    const el = $('#choice');
    el.classList.remove('hidden', 'single');
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
      if (this.auto) setTimeout(() => halves.forEach((h) => { if (!h.classList.contains('off')) h.querySelector('button')?.click(); }), 30);
    });
  }

  // 각자 폰: 내 선택지만 가운데에 크게
  chooseOne(role, opts, prompt, sub) {
    const el = $('#choice');
    el.classList.remove('hidden');
    el.classList.add('single');
    el.querySelector('.prompt').innerHTML = this.fmt(prompt || '') + (sub ? `<small>${sub}</small>` : '');
    const halves = [el.querySelector('.half.left'), el.querySelector('.half.right')];
    halves[1].classList.add('off');
    const h = halves[0];
    h.classList.remove('off', 'locked');
    h.querySelector('.who').textContent = this.roleLabel(role);
    h.querySelector('.who').className = 'who ' + (role === 0 ? 'p1' : 'p2');
    h.dataset.role = role;
    const box = h.querySelector('.opts');
    box.innerHTML = '';
    return new Promise((resolve) => {
      let picked = false;
      opts.forEach((t, k) => {
        const b = document.createElement('button');
        b.textContent = this.fmt(t);
        const pick = (e) => {
          e.preventDefault(); e.stopPropagation();
          if (picked) return;
          picked = true; b.classList.add('sel'); h.classList.add('locked');
          this.g.audio.play('choice');
          this.choiceKey = null;
          resolve(k);
        };
        b.addEventListener('touchstart', pick, { passive: false });
        b.addEventListener('click', pick);
        box.appendChild(b);
      });
      this.choiceKey = (code) => {
        const m = { Digit1: 0, Digit2: 1, Digit3: 2 };
        if (m[code] !== undefined) box.querySelectorAll('button')[m[code]]?.click();
      };
      if (this.auto) setTimeout(() => box.querySelector('button')?.click(), 30);
    });
  }
  hideChoice() { $('#choice').classList.add('hidden'); this.choiceKey = null; }
  waitNote(text) {
    const el = $('#waitNote');
    if (!text) { el.classList.add('hidden'); return; }
    el.querySelector('span').textContent = this.fmt(text);
    el.classList.remove('hidden');
  }

  // ------------------------------------------------------------ hold hands
  hold(prompt, sub) {
    const el = $('#hold');
    el.classList.remove('hidden', 'single');
    el.querySelector('.prompt').innerHTML = `${prompt}<small>${sub || ''}</small>`;
    const pads = [el.querySelector('.pad.left'), el.querySelector('.pad.right')];
    pads[0].querySelector('small').textContent = this.names.A;
    pads[1].querySelector('small').textContent = '그림자';
    pads[1].classList.remove('ghost');
    const ring = el.querySelector('.ring');
    const held = [new Set(), new Set()];
    let p = 0, last = performance.now(), beatT = 0;
    return new Promise((resolve) => {
      const handlers = pads.map((pad, i) => {
        const ts = (e) => { e.preventDefault(); for (const t of e.changedTouches) held[i].add(t.identifier); };
        const md = (e) => { e.preventDefault(); held[i].add('m' + i); };
        pad.addEventListener('touchstart', ts, { passive: false });
        pad.addEventListener('mousedown', md);
        return { pad, ts, md };
      });
      const off = (e) => { for (let i = 0; i < 2; i++) { if (e.changedTouches) for (const t of e.changedTouches) held[i].delete(t.identifier); } };
      const mu = () => { held[0].delete('m0'); held[1].delete('m1'); };
      window.addEventListener('touchend', off); window.addEventListener('touchcancel', off); window.addEventListener('mouseup', mu);
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
          window.removeEventListener('touchend', off); window.removeEventListener('touchcancel', off); window.removeEventListener('mouseup', mu);
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
  // 각자 폰: 내 손바닥 하나 + 상대가 누르고 있는지 표시
  holdOnline(role, prompt, sub, onChange) {
    const el = $('#hold');
    el.classList.remove('hidden');
    el.classList.add('single');
    el.querySelector('.prompt').innerHTML = `${prompt}<small>${sub || ''}</small>`;
    const mine = el.querySelector('.pad.left'), theirs = el.querySelector('.pad.right');
    mine.className = 'pad left ' + (role === 0 ? 'p1' : 'p2');
    theirs.className = 'pad right ghost ' + (role === 0 ? 'p2' : 'p1');
    mine.querySelector('small').textContent = '나';
    theirs.querySelector('small').textContent = role === 0 ? '그림자' : this.names.A;
    const ring = el.querySelector('.ring');
    const touches = new Set();
    let on = false;
    const set = (v) => { if (v === on) return; on = v; mine.classList.toggle('on', v); onChange(v); };
    const ts = (e) => { e.preventDefault(); for (const t of e.changedTouches) touches.add(t.identifier); set(true); };
    const te = (e) => { for (const t of e.changedTouches) touches.delete(t.identifier); if (!touches.size) set(false); };
    const md = (e) => { e.preventDefault(); touches.add('m'); set(true); };
    const mu = () => { touches.delete('m'); if (!touches.size) set(false); };
    const kd = (e) => { if (e.code === 'Space' || e.code === 'KeyQ' || e.code === 'Slash') set(true); };
    const ku = (e) => { if (e.code === 'Space' || e.code === 'KeyQ' || e.code === 'Slash') set(false); };
    mine.addEventListener('touchstart', ts, { passive: false });
    window.addEventListener('touchend', te); window.addEventListener('touchcancel', te);
    mine.addEventListener('mousedown', md); window.addEventListener('mouseup', mu);
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    if (this.auto) setTimeout(() => set(true), 30);
    let beatT = 0, lastP = 0;
    return {
      progress: (p, partnerOn) => {
        theirs.classList.toggle('on', !!partnerOn);
        ring.style.setProperty('--p', (p * 100).toFixed(1) + '%');
        if (p > lastP && on && partnerOn) {
          const now = performance.now();
          if (now - beatT > 800) { beatT = now; this.g.audio.play('heart'); if (navigator.vibrate) navigator.vibrate(30); }
        }
        lastP = p;
      },
      close: () => {
        mine.removeEventListener('touchstart', ts); window.removeEventListener('touchend', te); window.removeEventListener('touchcancel', te);
        mine.removeEventListener('mousedown', md); window.removeEventListener('mouseup', mu);
        window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
        this.g.audio.play('match');
        setTimeout(() => el.classList.add('hidden'), 400);
      },
    };
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
      const close = () => {
        this.advance = null; this.photoResolve = null;
        el.classList.remove('on');
        setTimeout(() => { el.classList.add('hidden'); resolve(); }, 350);
      };
      this.photoResolve = close;
      this.advance = () => {
        if (performance.now() - t0 < 900 && !this.auto) return;
        if (this.tapSink) { this.tapSink(); return; }
        close();
      };
      if (this.auto && !this.tapSink) setTimeout(close, 30);
    });
  }
  closePhoto() { if (this.photoResolve) this.photoResolve(); }

  // ------------------------------------------------------------ narration / card
  async narrate(lines, opts = {}, onLine) {
    const el = this.narrEl;
    const box = el.querySelector('.lines');
    box.innerHTML = '';
    el.classList.remove('hidden');
    el.style.background = opts.bg || '#030205';
    for (let i = 0; i < lines.length; i++) {
      this.addNarrLine(lines[i]);
      if (onLine) onLine(i);
      await this.waitTap(this.auto ? 20 : 1400);
    }
    await wait(this.auto ? 10 : 300);
    el.classList.add('hidden');
  }
  addNarrLine(ln) {
    const box = this.narrEl.querySelector('.lines');
    const d = document.createElement('div');
    d.textContent = this.fmt(ln).replace(/^~/, '');
    if (ln.startsWith('~')) d.classList.add('pen');
    d.style.whiteSpace = 'pre-line';
    box.appendChild(d);
    requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('on')));
  }
  // 참가자 폰: 방장이 보낸 줄까지 보여주기
  narrShow(lines, i, bg) {
    const el = this.narrEl;
    const box = el.querySelector('.lines');
    if (el.classList.contains('hidden') || i === 0) { box.innerHTML = ''; el.classList.remove('hidden'); }
    el.style.background = bg || '#030205';
    while (box.children.length <= i && box.children.length < lines.length) this.addNarrLine(lines[box.children.length]);
    this.advance = () => { if (this.tapSink) this.tapSink(); };
  }
  narrHide() { this.narrEl.classList.add('hidden'); this.advance = null; }
  waitTap(minMs) {
    return new Promise((resolve) => {
      let ready = false;
      setTimeout(() => { ready = true; if (this.auto) finish(); }, minMs);
      const finish = () => { this.advance = null; resolve(); };
      this.advance = () => { if (ready) finish(); };
    });
  }
  async card(ch) {
    const C = CHAPTERS[ch];
    const el = this.cardEl;
    el.querySelector('.small').textContent = `CHAPTER ${ch}`;
    el.querySelector('.big').textContent = C.title;
    el.querySelector('.sub').textContent = C.sub;
    el.classList.remove('hidden');
    el.style.opacity = '';
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
