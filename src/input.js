// 한 화면 2인 입력: 왼쪽 절반 = 1P, 오른쪽 절반 = 2P (플로팅 조이스틱 + 버튼), 키보드 지원
const DEAD = 0.14;
const RAD = 56;

const KEYMAP = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], a: ['KeyQ', 'KeyF'], b: ['KeyE', 'KeyG'] },
  { up: ['ArrowUp', 'KeyI'], down: ['ArrowDown', 'KeyK'], left: ['ArrowLeft', 'KeyJ'], right: ['ArrowRight', 'KeyL'], a: ['Slash', 'ShiftRight', 'Period', 'Numpad0'], b: ['Comma'] },
];

function mkState() {
  return { ax: 0, az: 0, mag: 0, aHeld: false, bHeld: false, aPressed: false, bPressed: false, a: false, b: false };
}

export class Input {
  constructor() {
    this.p = [mkState(), mkState()];
    this.st = [{ id: null, ox: 0, oy: 0, x: 0, y: 0 }, { id: null, ox: 0, oy: 0, x: 0, y: 0 }];
    this.keys = new Set();
    this.q = [[], []];
    this.btn = new Map();
    this.moved = [false, false];
    this.sticksEnabled = true;
    this.single = null; // 각자 폰 모드: 내 역할(0/1). 화면 전체가 내 조이스틱이에요
    this.onEmote = null;
    this.onKey = null; // 대화 넘기기 등
    this.layer = document.getElementById('touch');
    this.joyEl = [document.getElementById('joy0'), document.getElementById('joy1')];

    const L = this.layer;
    L.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) this.startStick(t.identifier, t.clientX, t.clientY);
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      let used = false;
      for (const t of e.changedTouches) used = this.moveStick(t.identifier, t.clientX, t.clientY) || used;
      if (used) e.preventDefault();
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) { this.endStick(t.identifier); this.endBtn(t.identifier); } };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    L.addEventListener('mousedown', (e) => this.startStick('m', e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => this.moveStick('m', e.clientX, e.clientY));
    window.addEventListener('mouseup', () => { this.endStick('m'); this.endBtn('m'); });

    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (!e.repeat) this.keyPress(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Slash') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.resetAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.resetAll(); });

    this.bindBtn('btnP1A', 0, 'a');
    this.bindBtn('btnP1B', 0, 'b');
    this.bindBtn('btnP2A', 1, 'a');
    for (const [id, role] of [['btnEmote0', 0], ['btnEmote1', 1]]) {
      const el = document.getElementById(id);
      if (!el) continue;
      const fire = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); setTimeout(() => el.classList.remove('down'), 150); this.onEmote?.(this.single ?? role, 'heart'); };
      el.addEventListener('touchstart', fire, { passive: false });
      el.addEventListener('mousedown', fire);
    }
  }

  resetAll() {
    this.keys.clear();
    for (let i = 0; i < 2; i++) { this.st[i].id = null; this.joyEl[i].classList.remove('on'); this.p[i].a = this.p[i].b = false; }
    for (const v of this.btn.values()) v.el.classList.remove('down');
    this.btn.clear();
  }

  bindBtn(id, p, k) {
    const el = document.getElementById(id);
    const down = (tid) => {
      this.btn.set(tid, { p, k, el });
      this.p[p][k] = true;
      this.q[p].push(k);
      el.classList.add('down');
    };
    el.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      for (const t of e.changedTouches) down(t.identifier);
    }, { passive: false });
    el.addEventListener('mousedown', (e) => { e.stopPropagation(); down('m'); });
  }
  endBtn(tid) {
    const b = this.btn.get(tid);
    if (!b) return;
    this.btn.delete(tid);
    for (const v of this.btn.values()) if (v.p === b.p && v.k === b.k) return;
    this.p[b.p][b.k] = false;
    b.el.classList.remove('down');
  }

  keyPress(code) {
    for (let i = 0; i < 2; i++) {
      const tgt = this.single !== null ? this.single : i;
      if (KEYMAP[i].a.includes(code)) this.q[tgt].push('a');
      if (KEYMAP[i].b.includes(code)) this.q[tgt].push('b');
    }
    if (code === 'KeyH' || code === 'KeyU') this.onEmote?.(this.single ?? (code === 'KeyH' ? 0 : 1), 'heart');
    if (this.onKey) this.onKey(code);
  }

  startStick(id, x, y) {
    if (!this.sticksEnabled) return;
    const side = this.single !== null ? this.single : x < window.innerWidth / 2 ? 0 : 1;
    const s = this.st[side];
    if (s.id !== null) return;
    s.id = id; s.ox = s.x = x; s.oy = s.y = y;
    const el = this.joyEl[side];
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.firstElementChild.style.transform = 'translate(0px,0px)';
    el.classList.add('on');
  }
  moveStick(id, x, y) {
    for (let i = 0; i < 2; i++) {
      const s = this.st[i];
      if (s.id !== id) continue;
      s.x = x; s.y = y;
      let dx = x - s.ox, dy = y - s.oy;
      const d = Math.hypot(dx, dy), lim = RAD * 1.25;
      if (d > lim) { // 기준점이 손가락을 따라와요 (플로팅)
        s.ox = x - (dx / d) * lim; s.oy = y - (dy / d) * lim;
        const el = this.joyEl[i];
        el.style.left = s.ox + 'px'; el.style.top = s.oy + 'px';
        dx = x - s.ox; dy = y - s.oy;
      }
      const m = Math.hypot(dx, dy), k = m > RAD ? RAD / m : 1;
      this.joyEl[i].firstElementChild.style.transform = `translate(${dx * k}px,${dy * k}px)`;
      return true;
    }
    return false;
  }
  endStick(id) {
    for (let i = 0; i < 2; i++) {
      if (this.st[i].id === id) { this.st[i].id = null; this.joyEl[i].classList.remove('on'); }
    }
  }

  held(i, k) {
    const maps = this.single !== null ? (i === this.single ? [KEYMAP[0][k], KEYMAP[1][k]] : []) : [KEYMAP[i][k]];
    for (const km of maps) for (const c of km) if (this.keys.has(c)) return true;
    return this.p[i][k];
  }

  update() {
    for (let i = 0; i < 2; i++) {
      const P = this.p[i];
      let ax = 0, az = 0;
      const s = this.st[i];
      if (s.id !== null) {
        ax = (s.x - s.ox) / RAD; az = (s.y - s.oy) / RAD;
        const m = Math.hypot(ax, az);
        if (m > 1) { ax /= m; az /= m; }
      }
      const K = KEYMAP[i];
      const has = (arr) => arr.some((c) => this.keys.has(c));
      let kx = (has(K.right) ? 1 : 0) - (has(K.left) ? 1 : 0);
      let kz = (has(K.down) ? 1 : 0) - (has(K.up) ? 1 : 0);
      if (this.single !== null) {
        // 각자 폰: WASD든 방향키든 내 캐릭터
        if (i !== this.single) { kx = kz = 0; ax = az = 0; }
        else {
          const O = KEYMAP[1 - i];
          kx += (has(O.right) ? 1 : 0) - (has(O.left) ? 1 : 0);
          kz += (has(O.down) ? 1 : 0) - (has(O.up) ? 1 : 0);
          kx = Math.sign(kx); kz = Math.sign(kz);
        }
      }
      if (kx || kz) { const m = Math.hypot(kx, kz); ax = kx / m; az = kz / m; }
      let mag = Math.hypot(ax, az);
      if (mag < DEAD) { ax = az = mag = 0; }
      else {
        const nm = Math.min(1, (mag - DEAD) / (1 - DEAD));
        ax = (ax / mag) * nm; az = (az / mag) * nm; mag = nm;
      }
      P.ax = ax; P.az = az; P.mag = mag;
      P.aPressed = this.q[i].includes('a');
      P.bPressed = this.q[i].includes('b');
      this.q[i].length = 0;
      P.aHeld = this.held(i, 'a');
      P.bHeld = this.held(i, 'b');
      if (mag > 0.35) this.moved[i] = true;
    }
  }
  flush() {
    this.q[0].length = 0; this.q[1].length = 0;
  }
}
