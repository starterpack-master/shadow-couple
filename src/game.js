import * as THREE from 'three';
import { CFG, IS_MOBILE, clamp, damp } from './config.js';
import { Occluders } from './shadow.js';
import { U, PAL } from './materials.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { UI } from './ui.js';
import { FX } from './fx.js';
import { Room } from './room.js';
import { Bearer, Shade, Moth, ZERO_INPUT } from './entities.js';
import { ROOMS } from './levels.js';
import { STORY } from './story.js';
import { Hospital } from './ending.js';
import { makeCharacter } from './models.js';
import { Net } from './net.js';
import { Emotes } from './emotes.js';

const $ = (s) => document.querySelector(s);
const PITCH = (57 * Math.PI) / 180;
const SAVE_KEY = 'iwbys_save_v1';
const rnd2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

// mode: 'local' (한 폰) | 'host' (방장: 판정 담당) | 'guest' (참가자: 화면/조작만)
export class Game {
  constructor(canvas) {
    const params = new URLSearchParams(location.search);
    this.params = params;
    this.lowPower = IS_MOBILE || params.has('low');
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lowPower, alpha: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lowPower ? 1.5 : 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x1d2130, 26, 75);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 320);
    this.cam = { x: 0, z: 0, d: 24, shake: 0 };

    this.hemi = new THREE.HemisphereLight(0x8b95c0, 0x2a2a3a, 0.6);
    this.scene.add(this.hemi);
    this.lamp = new THREE.PointLight(0xffb35c, 9, 9, 1.25);
    this.lamp.castShadow = true;
    const ms = this.lowPower ? 512 : 1024;
    this.lamp.shadow.mapSize.set(ms, ms);
    this.lamp.shadow.bias = -0.004;
    this.lamp.shadow.normalBias = 0.02;
    this.lamp.shadow.camera.near = 0.05;
    this.lamp.shadow.camera.far = 16;
    this.scene.add(this.lamp);
    this.moon = new THREE.DirectionalLight(0xbfd4ff, 0);
    this.scene.add(this.moon, this.moon.target);

    this.occ = new Occluders();
    this.input = new Input();
    this.audio = new AudioSys();
    this.ui = new UI(this);
    this.fx = new FX(this.scene);
    this.bearer = new Bearer(this);
    this.shade = new Shade(this);
    this.moth = new Moth(this);
    this.emotes = new Emotes(this);

    this.mode = 'local';
    this.myRole = null;
    this.net = null;
    this.evq = [];
    this.capturing = false;
    this.remoteIn = { ...ZERO_INPUT };
    this.uiSeq = 0;
    this.curUI = null;
    this.sendT = 0;

    this.time = 0;
    this.frozen = true;
    this.paused = false;
    this.abil = { dash: false, height: false, place: false };
    this.flags = {};
    this.room = null;
    this.roomIdx = 0;
    this.lt = null;
    this.camFocus = null;
    this.save = this.loadSave();
    this.lights = [this.bearer.light];
    this.quiz = [];

    this.wrapCapture();
    if (params.has('auto')) this.ui.auto = true;
    this.input.onKey = (code) => {
      if (this.ui.choiceKey) this.ui.choiceKey(code);
      if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') this.ui.tapDialog();
      if (code === 'Escape' && this.state === 'play') this.toggleMenu();
    };
    this.input.onEmote = (role, kind) => this.emote(role, kind, true);

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    this.resize();
    this.setupTitle();
    this.setupMenu();

    this.state = 'title';
    this.loadRoom(0);
    this.frozen = true;
    this.ui.fade(0, 1200);
    this.lastT = performance.now();
    r.setAnimationLoop(() => this.frame());
    window.__game = this;
  }

  get isHost() { return this.mode !== 'guest'; }
  owns(role) { return this.mode === 'local' || this.myRole === role; }
  get otherRole() { return this.myRole === 0 ? 1 : 0; }

  // 방장 쪽에서 일어난 효과음/파티클/흔들림을 모아 참가자에게 보내요
  wrapCapture() {
    const fx = this.fx;
    this.fxRaw = {};
    for (const name of ['burst', 'puff', 'spark']) {
      const orig = fx[name].bind(fx);
      this.fxRaw[name] = orig;
      fx[name] = (...a) => { if (this.capturing) this.evq.push(['f', name, a.map((v) => (typeof v === 'object' ? v : rnd2(v)))]); orig(...a); };
    }
    const au = this.audio;
    const play = au.play.bind(au);
    this.playRaw = play;
    au.play = (n) => { if (this.capturing && n !== 'step' && n !== 'type' && n !== 'tap') this.evq.push(['a', n]); play(n); };
  }

  // ================================================================ save
  loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch { return null; }
  }
  writeSave(room) {
    if (this.mode === 'guest') return;
    this.save = { room, names: this.ui.names, quiz: this.quiz || [], mode: this.mode, role: this.myRole };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* ignore */ }
  }

  // ================================================================ title / lobby
  setupTitle() {
    const show = (id) => { for (const el of document.querySelectorAll('#title .step')) el.classList.toggle('hidden', el.id !== id); };
    this.showStep = show;
    const myName = localStorage.getItem('iwbys_name') || '';
    $('#nameMe').value = myName; $('#nameJoin').value = myName;
    if (this.save?.names) { $('#nameA').value = this.save.names.A; $('#nameB').value = this.save.names.B; }
    let role = 0;
    for (const b of document.querySelectorAll('#title .role')) {
      b.addEventListener('click', () => {
        role = +b.dataset.role;
        for (const o of document.querySelectorAll('#title .role')) o.classList.toggle('sel', o === b);
        this.audio.init(); this.audio.play('choice');
      });
    }
    for (const b of document.querySelectorAll('#title .back')) b.addEventListener('click', () => { this.audio.init(); if (this.net) { this.net.destroy(); this.net = null; } show('stepHome'); });
    $('#goCreate').addEventListener('click', () => { this.audio.init(); show('stepCreate'); });
    $('#goJoin').addEventListener('click', () => { this.audio.init(); show('stepJoin'); setTimeout(() => $('#codeIn').focus(), 50); });
    $('#goLocal').addEventListener('click', () => { this.audio.init(); show('stepLocal'); });

    // --- 한 폰 모드
    const contLocal = $('#btnContinue');
    if (this.save && this.save.mode === 'local' && this.save.room > 0 && this.save.room < ROOMS.length) {
      contLocal.classList.remove('hidden');
      contLocal.textContent = `이어하기 (${ROOMS[this.save.room].id})`;
    }
    const beginLocal = (fromSave) => {
      this.audio.init(); this.tryFullscreen();
      const A = $('#nameA'), B = $('#nameB');
      this.ui.names = { A: (A.value || A.placeholder).trim() || '해솔', B: (B.value || B.placeholder).trim() || '다온' };
      this.mode = 'local'; this.myRole = null; this.input.single = null;
      document.getElementById('app').classList.remove('online', 'me0', 'me1');
      this.quiz = fromSave ? this.save?.quiz || [] : [];
      this.startGame(fromSave ? this.save.room : 0, !fromSave);
    };
    $('#btnStart').addEventListener('click', () => beginLocal(false));
    contLocal.addEventListener('click', () => beginLocal(true));

    // --- 방 만들기 (방장)
    $('#btnHost').addEventListener('click', async () => {
      this.audio.init();
      const name = ($('#nameMe').value || '').trim() || (role === 0 ? '해솔' : '다온');
      localStorage.setItem('iwbys_name', name);
      this.myName = name;
      this.myRole = role;
      show('stepCode');
      $('#codeShow').textContent = '····';
      $('#hostStatus').innerHTML = '<i class="spin"></i>방을 만드는 중…';
      $('#hostStatus').className = 'status';
      $('#btnHostStart').classList.add('hidden'); $('#btnHostContinue').classList.add('hidden');
      try {
        this.net = new Net();
        this.bindNet();
        const code = await this.net.host();
        this.mode = 'host';
        $('#codeShow').textContent = code;
        $('#hostStatus').innerHTML = '<i class="spin"></i>상대를 기다리는 중…';
      } catch (e) {
        $('#hostStatus').textContent = '방을 만들지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
        $('#hostStatus').className = 'status err';
      }
    });
    const hostBegin = (fromSave) => {
      this.tryFullscreen();
      this.quiz = fromSave ? this.save?.quiz || [] : [];
      if (fromSave && this.save?.names) {
        // 이어하기: 역할은 저장된 그대로
      }
      this.net.send({ t: 'start' });
      this.startGame(fromSave ? this.save.room : 0, !fromSave);
    };
    $('#btnHostStart').addEventListener('click', () => hostBegin(false));
    $('#btnHostContinue').addEventListener('click', () => hostBegin(true));

    // --- 코드로 참가 (참가자)
    $('#codeIn').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    $('#btnJoin').addEventListener('click', async () => {
      this.audio.init();
      const code = ($('#codeIn').value || '').trim().toUpperCase();
      const name = ($('#nameJoin').value || '').trim() || '다온';
      if (code.length !== 4) { $('#joinStatus').textContent = '4자리 코드를 입력해 주세요'; $('#joinStatus').className = 'status err'; return; }
      localStorage.setItem('iwbys_name', name);
      this.myName = name;
      $('#joinStatus').innerHTML = '<i class="spin"></i>연결하는 중…';
      $('#joinStatus').className = 'status';
      try {
        this.net = new Net();
        this.bindNet();
        await this.net.join(code);
        this.mode = 'guest';
        this.net.send({ t: 'hello', name });
        $('#joinStatus').innerHTML = '<i class="spin"></i>연결됐어요! 방장이 시작하길 기다리는 중…';
        $('#joinStatus').className = 'status ok';
      } catch (e) {
        if (this.net) { this.net.destroy(); this.net = null; }
        $('#joinStatus').textContent = e?.type === 'peer-unavailable' ? '그 코드의 방을 찾을 수 없어요. 코드를 다시 확인해 주세요.' : '연결하지 못했어요. 같은 와이파이에서 다시 시도해 보세요.';
        $('#joinStatus').className = 'status err';
      }
    });

    // 개발용: ?room=3-1&go
    const startIdx = this.params.get('room');
    if (startIdx !== null) {
      const i = ROOMS.findIndex((rr) => rr.id === startIdx);
      const idx = i >= 0 ? i : parseInt(startIdx, 10) || 0;
      this.save = { room: idx, names: { A: '해솔', B: '다온' }, quiz: [], mode: 'local' };
      if (this.params.has('go')) setTimeout(() => { this.audio.init(); this.startGame(idx, false); }, 50);
    }
  }

  // ================================================================ networking
  bindNet() {
    const n = this.net;
    n.on('msg', (m) => this.onMsg(m));
    n.on('connect', () => {
      $('#conn').classList.add('hidden');
      if (n.role === 'host') this.onGuestConnected();
    });
    n.on('lost', () => {
      if (this.state === 'title' && n.role === 'host') {
        $('#hostStatus').innerHTML = '<i class="spin"></i>상대의 연결이 끊겼어요. 다시 기다리는 중…';
        $('#btnHostStart').classList.add('hidden'); $('#btnHostContinue').classList.add('hidden');
        return;
      }
      if (this.state === 'title') return;
      $('#conn').classList.remove('hidden');
      $('#connMsg').textContent = n.role === 'host' ? '상대의 연결이 끊겼어요. 같은 코드(' + n.code + ')로 다시 들어오길 기다리는 중…' : '연결이 끊겼어요. 다시 연결하는 중…';
      if (n.role === 'guest') this.retryJoin();
    });
    $('#connHome').onclick = () => location.reload();
  }
  async retryJoin() {
    if (this.retrying) return;
    this.retrying = true;
    for (let i = 0; i < 20 && !this.net.connected; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      if (this.net.connected) break;
      await this.net.rejoin();
      if (this.net.connected) this.net.send({ t: 'hello', name: this.myName, again: true });
    }
    this.retrying = false;
  }
  onGuestConnected() {
    // 상대가 들어오면 이름을 기다려요 (hello)
  }
  namesFor(hostName, guestName) {
    return this.myRole === 0 ? { A: hostName, B: guestName } : { A: guestName, B: hostName };
  }
  onMsg(m) {
    if (!m || !m.t) return;
    if (this.mode === 'guest' || this.net.role === 'guest') this.onGuestMsg(m); else this.onHostMsg(m);
  }
  // ---------------------------------------------------------------- 방장이 받는 메시지
  onHostMsg(m) {
    switch (m.t) {
      case 'hello': {
        this.partnerName = m.name;
        this.ui.names = this.namesFor(this.myName, m.name);
        this.net.send({ t: 'setup', role: this.otherRole, names: this.ui.names });
        if (this.state === 'title') {
          $('#hostStatus').innerHTML = `💞 <b>${m.name}</b> 님이 들어왔어요!`;
          $('#hostStatus').className = 'status ok';
          $('#btnHostStart').classList.remove('hidden');
          const sv = this.save;
          if (sv && sv.mode === 'host' && sv.room > 0 && sv.room < ROOMS.length && sv.role === this.myRole) {
            $('#btnHostContinue').classList.remove('hidden');
            $('#btnHostContinue').textContent = `이어하기 (${ROOMS[sv.room].id})`;
          }
          this.audio.play('match');
        } else {
          // 게임 도중 재접속: 지금 방과 진행 중인 화면을 다시 보내요
          this.net.send({ t: 'start' });
          this.net.send({ t: 'room', i: this.roomIdx, hud: !$('#hud').classList.contains('hidden') });
          if (this.curUI) this.net.send(this.curUI);
          if (this.hospital) this.net.send({ t: 'ui', op: 'hosp' });
        }
        break;
      }
      case 'i': { // 참가자의 조작
        const role = this.otherRole;
        this.remoteIn = { ax: m.ax, az: m.az, mag: Math.hypot(m.ax, m.az), aHeld: !!m.ah, bHeld: !!m.bh, aPressed: false, bPressed: false };
        if (role === 0) this.bearer.netT = { x: m.x, z: m.z, f: m.f, sp: m.sp };
        else if (m.seq === this.shade.seq && this.shade.alive) { this.shade.netT = { x: m.x, z: m.z, f: m.f, sp: m.sp }; this.shade.remoteDash = !!m.dash; }
        break;
      }
      case 'cmd': {
        if (this.frozen || !this.room) break;
        this.capturing = true;
        if (m.c === 'height' && this.abil.height) this.bearer.toggleHeight();
        if (m.c === 'useB') this.bearer.useB();
        this.capturing = false;
        break;
      }
      case 'ev': {
        if (m.k === 'dash') { this.fxRaw.burst(m.x, 0.5, m.z, 10, 0x9d7bff, 2.5, 0.5, 0.2); this.playRaw('dash'); }
        break;
      }
      case 'emote': this.emote(m.role, m.kind, false); break;
      case 'uiR': this.onUIReply(m); break;
      default: break;
    }
  }
  // ---------------------------------------------------------------- 참가자가 받는 메시지
  onGuestMsg(m) {
    switch (m.t) {
      case 'setup': {
        this.myRole = m.role;
        this.ui.names = m.names;
        this.input.single = m.role;
        const app = document.getElementById('app');
        app.classList.add('online'); app.classList.toggle('me0', m.role === 0); app.classList.toggle('me1', m.role === 1);
        $('#p1name').textContent = this.ui.names.A;
        break;
      }
      case 'start': {
        if (this.state === 'title') {
          this.tryFullscreen();
          $('#title').classList.add('hidden');
          this.resetScroll();
          setTimeout(() => this.resize(), 300);
          this.state = 'story';
        }
        break;
      }
      case 'room': {
        if (this.roomIdx !== m.i || !this.room || this.hospital) this.loadRoom(m.i);
        $('#hud').classList.toggle('hidden', !m.hud);
        this.audio.setSong(ROOMS[m.i].ch);
        break;
      }
      case 's': this.applySnapshot(m); break;
      case 'ui': this.onUIOp(m); break;
      case 'emote': this.emote(m.role, m.kind, false); break;
      default: break;
    }
  }

  sendSnapshot() {
    const n = this.net;
    if (!n || !n.connected || !this.room) { this.evq.length = 0; return; }
    const lt = this.lt;
    n.send({
      t: 's', ri: this.roomIdx, fz: this.frozen ? 1 : 0, st: this.state,
      b: this.bearer.net(), s: this.shade.net(), r: this.room.netState(),
      ab: this.abil, cf: this.camFocus, lt: lt ? [lt.phase === 'warn' ? 1 : 0, rnd2(this.moon.intensity)] : 0,
      mo: this.moth.target ? [rnd2(this.moth.target.x), rnd2(this.moth.target.y), rnd2(this.moth.target.z)] : 0, mv: this.moth.visible ? 1 : 0,
      big: this.bigLight ? rnd2(this.lampLit || 0) : -1,
      ev: this.evq.splice(0),
    });
  }
  applySnapshot(m) {
    if (!this.room || m.ri !== this.roomIdx) return;
    this.bearer.setNet(m.b, this.owns(0));
    this.shade.setNet(m.s, this.owns(1));
    this.room.applyNet(m.r);
    this.frozen = !!m.fz;
    this.state = m.st === 'play' ? 'play' : this.state === 'ending' ? 'ending' : 'story';
    if (JSON.stringify(m.ab) !== JSON.stringify(this.abil)) { this.abil = m.ab; this.updateButtons(true); }
    this.camFocus = m.cf || null;
    if (m.lt) { $('#bolt').classList.toggle('on', !!m.lt[0]); this.moonTarget = m.lt[1]; }
    this.moth.target = m.mo ? new THREE.Vector3(m.mo[0], m.mo[1], m.mo[2]) : null;
    this.moth.visible = !!m.mv;
    if (m.big >= 0 && this.bigLight) this.lampLit = m.big;
    this.onLampMode();
    for (const e of m.ev || []) {
      if (e[0] === 'f') this.fxRaw[e[1]](...e[2]);
      else if (e[0] === 'a') this.playRaw(e[1]);
      else if (e[0] === 's') this.cam.shake = Math.max(this.cam.shake, e[1]);
      else if (e[0] === 'k' && this.owns(1)) { this.shade.vx += e[1]; this.shade.vz += e[2]; this.shade.squash = 0.7; }
      else if (e[0] === 'fl') this.ui.flash(e[1]);
    }
  }
  sendInput() {
    const n = this.net;
    if (!n || !n.connected) return;
    const role = this.myRole, P = this.input.p[role];
    const ch = role === 0 ? this.bearer : this.shade;
    n.send({ t: 'i', ax: rnd2(P.ax), az: rnd2(P.az), ah: P.aHeld ? 1 : 0, bh: P.bHeld ? 1 : 0,
      x: rnd2(ch.pos.x), z: rnd2(ch.pos.y), f: rnd2(ch.face), sp: rnd2(ch.speed), dash: role === 1 && this.shade.dashT > 0 ? 1 : 0, seq: this.shade.seq });
  }
  cmd(c) {
    if (this.mode === 'guest') { this.net.send({ t: 'cmd', c }); return; }
    if (c === 'height' && this.abil.height) this.bearer.toggleHeight();
    if (c === 'useB') this.bearer.useB();
  }
  onShadeDash(x, z) {
    if (this.mode === 'guest') this.net.send({ t: 'ev', k: 'dash', x: rnd2(x), z: rnd2(z) });
  }
  onShadeKnock(vx, vz) {
    if (this.mode === 'host' && !this.owns(1)) this.evq.push(['k', rnd2(vx), rnd2(vz)]);
  }

  // ================================================================ 화면 연출 동기화 (방장 → 참가자)
  sendUI(op) {
    if (this.mode !== 'host' || !this.net) return;
    const m = { t: 'ui', ...op };
    this.net.send(m);
    return m;
  }
  get D() {
    if (this._D) return this._D;
    const g = this, ui = this.ui;
    const host = () => g.mode === 'host';
    this._D = {
      say: async (who, text) => {
        if (!host()) return ui.say(who, text);
        const id = ++g.uiSeq;
        g.curUI = g.sendUI({ op: 'say', id, who, text });
        await ui.say(who, text);
        g.curUI = null;
        g.sendUI({ op: 'close', id });
      },
      choose: async (who, opts, prompt) => {
        if (!host()) return ui.choose(who, opts, prompt);
        const id = ++g.uiSeq;
        const roles = who === 'both' ? [0, 1] : [who];
        const res = [null, null];
        const listFor = (r) => (who === 'both' ? opts[r] : opts);
        const sub = who === 'both' ? '상대에게는 보이지 않아요. 솔직하게!' : '';
        g.curUI = g.sendUI({ op: 'choose', id, who, opts, prompt, sub });
        const tasks = [];
        if (roles.includes(g.myRole)) tasks.push(ui.chooseOne(g.myRole, listFor(g.myRole), prompt, sub).then((k) => { res[g.myRole] = k; if (roles.length > 1) ui.waitNote('상대가 고르는 중…'); }));
        else ui.waitNote(`${g.otherRole === 0 ? g.ui.names.A : '그림자'}가 고르는 중…\n${ui.fmt(prompt)}`);
        if (roles.includes(g.otherRole)) tasks.push(new Promise((resolve) => { g.pendingChoice = { id, resolve: (k) => { res[g.otherRole] = k; resolve(); } }; }));
        await Promise.all(tasks);
        g.pendingChoice = null; g.curUI = null;
        ui.hideChoice(); ui.waitNote(null);
        g.sendUI({ op: 'chooseDone', id });
        return who === 'both' ? res : res[who];
      },
      photo: async (id) => {
        if (!host()) return ui.photo(id);
        const uid = ++g.uiSeq;
        g.curUI = g.sendUI({ op: 'photo', id: uid, pid: id });
        await ui.photo(id);
        g.curUI = null;
        g.sendUI({ op: 'photoClose', id: uid });
      },
      narrate: async (lines, o = {}) => {
        if (!host()) return ui.narrate(lines, o);
        const id = ++g.uiSeq;
        await ui.narrate(lines, o, (i) => { g.curUI = g.sendUI({ op: 'narr', id, lines, i, bg: o.bg }); });
        g.curUI = null;
        g.sendUI({ op: 'narrEnd', id });
      },
      card: async (ch) => { g.sendUI({ op: 'card', ch }); await ui.card(ch); },
      hold: async (p, sub) => {
        if (!host()) return ui.hold(p, sub);
        const id = ++g.uiSeq;
        g.curUI = g.sendUI({ op: 'hold', id, p, sub });
        let mine = false, prog = 0, last = performance.now(), sendT = 0;
        g.remoteHold = false;
        const ctl = ui.holdOnline(g.myRole, p, sub, (v) => { mine = v; });
        await new Promise((resolve) => {
          const loop = () => {
            const now = performance.now(), dt = (now - last) / 1000; last = now;
            const both = (mine && g.remoteHold) || ui.auto;
            prog = both ? Math.min(1, prog + dt / 1.6) : Math.max(0, prog - dt * 0.8);
            ctl.progress(prog, g.remoteHold);
            sendT -= dt;
            if (sendT <= 0) { sendT = 0.1; g.sendUI({ op: 'holdP', id, p: rnd2(prog), on: mine ? 1 : 0 }); }
            if (prog >= 1) { resolve(); return; }
            requestAnimationFrame(loop);
          };
          loop();
        });
        ctl.close();
        g.curUI = null;
        g.sendUI({ op: 'holdDone', id });
      },
      toast: (t, d) => { ui.toast(t, d); g.sendUI({ op: 'toast', text: t, d }); },
      fade: (to, ms, white) => { g.sendUI({ op: 'fade', to, ms, white }); return ui.fade(to, ms, white); },
      flash: (s) => { ui.flash(s); g.sendUI({ op: 'flash', s }); },
    };
    return this._D;
  }
  onUIReply(m) {
    const cur = this.curUI;
    if (m.op === 'tap') { if (cur && cur.id === m.id) this.ui.tapDialog(); }
    else if (m.op === 'choice') { if (this.pendingChoice && this.pendingChoice.id === m.id) this.pendingChoice.resolve(m.k); }
    else if (m.op === 'hold') this.remoteHold = !!m.on;
  }
  // 참가자: 방장이 보낸 연출을 그대로 재생
  onUIOp(m) {
    const ui = this.ui;
    const tap = () => this.net.send({ t: 'uiR', op: 'tap', id: m.id });
    switch (m.op) {
      case 'say': ui.tapSink = tap; ui.say(m.who, m.text); break;
      case 'close': ui.closeDialog(); break;
      case 'choose': {
        const roles = m.who === 'both' ? [0, 1] : [m.who];
        const list = m.who === 'both' ? m.opts[this.myRole] : m.opts;
        if (roles.includes(this.myRole)) {
          ui.chooseOne(this.myRole, list, m.prompt, m.sub).then((k) => {
            this.net.send({ t: 'uiR', op: 'choice', id: m.id, k });
            if (roles.length > 1) ui.waitNote('상대가 고르는 중…');
          });
        } else ui.waitNote(`${this.otherRole === 0 ? ui.names.A : '그림자'}가 고르는 중…\n${ui.fmt(m.prompt)}`);
        break;
      }
      case 'chooseDone': ui.hideChoice(); ui.waitNote(null); break;
      case 'photo': ui.tapSink = tap; ui.photo(m.pid); break;
      case 'photoClose': ui.closePhoto(); break;
      case 'narr': ui.tapSink = tap; ui.narrShow(m.lines, m.i, m.bg); break;
      case 'narrEnd': ui.narrHide(); break;
      case 'card': ui.card(m.ch); break;
      case 'hold': {
        this.holdCtl = ui.holdOnline(this.myRole, m.p, m.sub, (v) => this.net.send({ t: 'uiR', op: 'hold', id: m.id, on: v ? 1 : 0 }));
        break;
      }
      case 'holdP': if (this.holdCtl) this.holdCtl.progress(m.p, !!m.on); break;
      case 'holdDone': if (this.holdCtl) { this.holdCtl.close(); this.holdCtl = null; } break;
      case 'toast': ui.toast(m.text, m.d); break;
      case 'fade': ui.fade(m.to, m.ms, m.white); break;
      case 'flash': ui.flash(m.s); break;
      case 'tut': this.showTutorial(m.l, m.r); break;
      case 'hud': $('#hud').classList.toggle('hidden', !m.on); break;
      case 'buttons': this.updateButtons(true); break;
      case 'lampBurst': this.lampBurst(true); break;
      case 'reveal': this.revealB(true); break;
      case 'mothToB': this.mothToB(true); break;
      case 'hosp': this.playHospital(true); break;
      case 'hospSet': if (this.hospital) this.hospital[m.k] = m.v; break;
      case 'end': this.quiz = m.quiz || []; this.showEndCard(); break;
      case 'celebrate': this.celebrate(); this.playRaw('complete'); break;
      case 'obj': $('#objective').textContent = m.text; break;
      case 'song': this.audio.setSong(m.s); break;
      default: break;
    }
  }

  // ================================================================ menu
  tryFullscreen() {
    if (!IS_MOBILE) return;
    const el = document.documentElement;
    try {
      const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen && el.webkitRequestFullscreen();
      if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    } catch { /* ignore */ }
  }
  setupMenu() {
    const menu = $('#menu');
    $('#pauseBtn').addEventListener('click', () => this.toggleMenu());
    $('#pauseBtn').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.toggleMenu(); }, { passive: false });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'resume') this.toggleMenu(false);
      else if (act === 'hint') { const h = menu.querySelector('.hint'); h.textContent = '💡 ' + (ROOMS[this.roomIdx]?.hint || ''); h.classList.add('on'); }
      else if (act === 'restart') { this.toggleMenu(false); if (this.mode === 'guest') this.net.send({ t: 'cmdRoom', c: 'restart' }); else this.resolveRoom?.('restart'); }
      else if (act === 'skip') { if (confirm('이 방을 건너뛸까요?')) { this.toggleMenu(false); if (this.mode === 'guest') this.net.send({ t: 'cmdRoom', c: 'skip' }); else this.resolveRoom?.('skip'); } }
      else if (act === 'sound') { this.audio.setMuted(!this.audio.muted); b.textContent = this.audio.muted ? '🔈 소리 켜기' : '🔊 소리 끄기'; }
      else if (act === 'title') { location.reload(); }
    });
    menu.querySelector('[data-act="sound"]').textContent = this.audio.muted ? '🔈 소리 켜기' : '🔊 소리 끄기';
  }
  toggleMenu(force) {
    const menu = $('#menu');
    const open = force ?? menu.classList.contains('hidden');
    if (open && this.state !== 'play') return;
    menu.classList.toggle('hidden', !open);
    menu.querySelector('.hint').classList.remove('on');
    // 온라인에서는 게임을 멈추지 않아요 (상대가 기다리지 않도록)
    this.paused = open && this.mode === 'local';
  }

  // ================================================================ main flow
  startGame(start, withPrologue) {
    $('#title').classList.add('hidden');
    this.resetScroll();
    $('#p1name').textContent = this.ui.names.A;
    $('#p2name').textContent = '그림자';
    if (this.mode === 'host') {
      this.input.single = this.myRole;
      const app = document.getElementById('app');
      app.classList.add('online'); app.classList.toggle('me0', this.myRole === 0); app.classList.toggle('me1', this.myRole === 1);
      // 참가자 쪽 방/재시작 요청
      this.net.on('msg', (m) => {
        if (m.t === 'cmdRoom' && this.state === 'play') this.resolveRoom?.(m.c);
      });
    }
    this.run(start, withPrologue);
  }
  async run(start, withPrologue) {
    this.state = 'story';
    if (withPrologue) {
      await this.D.fade(1, 500);
      await STORY.prologue(this.S);
    }
    for (let i = start; i < ROOMS.length; i++) {
      const res = await this.playRoom(i);
      if (res === 'final') return;
    }
  }

  async playRoom(i, skipIntro = false) {
    const def = ROOMS[i];
    await this.D.fade(1, 500);
    this.loadRoom(i);
    this.sendUI({ op: 'song', s: def.ch });
    if (this.mode === 'host') this.net.send({ t: 'room', i, hud: true });
    this.writeSave(i);
    this.audio.setSong(def.ch);
    this.frozen = true;
    this.state = 'story';
    $('#hud').classList.remove('hidden');
    await this.D.fade(0, 700);
    const script = STORY.rooms[def.id];
    if (script?.intro && !skipIntro) await script.intro(this.S);
    this.release();
    this.state = 'play';
    this.frozen = false;
    this.input.flush();
    const res = await new Promise((resolve) => { this.resolveRoom = resolve; });
    this.resolveRoom = null;
    this.frozen = true;
    this.state = 'story';
    if (res === 'restart') return this.playRoom(i, true);
    if (res === 'final') return 'final';
    if (res === 'skip' && this.room.memory && !this.room.memory.taken) {
      this.room.memory.taken = true;
      await STORY.memories[this.room.memory.id]?.(this.S);
    }
    if (res !== 'skip') {
      this.audio.play('complete'); this.celebrate();
      this.sendUI({ op: 'celebrate' });
      await this.S.wait(0.9);
    }
    this.hideTutorial();
    if (script?.outro) await script.outro(this.S);
    this.writeSave(i + 1);
    return res;
  }

  completeRoom() {
    if (this.resolveRoom) this.resolveRoom('done');
  }

  celebrate() {
    const e = this.room?.exit;
    if (!e) return;
    for (let k = 0; k < 3; k++) this.fxRaw.burst(e.cx, 0.5 + k * 0.4, e.cz, 20, k % 2 ? 0xffd9a0 : 0xc9b6ff, 3, 1.2, 0.25);
  }

  // ================================================================ room setup
  loadRoom(i) {
    if (this.room) this.room.dispose();
    if (this.hospital) { this.hospital.dispose(); this.hospital = null; }
    this.fx.clear();
    this.occ.clear();
    this.bearer.attach(this.occ);
    this.roomIdx = i;
    const def = ROOMS[i];
    const room = (this.room = new Room(this, def));
    this.abil = { ...def.abil };
    const pal = PAL[def.ch];
    this.dustColor = new THREE.Color(pal.floor).multiplyScalar(1.2).getHex();
    $('#app').style.background = `linear-gradient(${pal.sky[0]}, ${pal.sky[1]})`;
    this.scene.fog.color.set(pal.fog);
    this.scene.fog.near = 26; this.scene.fog.far = 75;
    this.hemi.color.set(pal.hemiS); this.hemi.groundColor.set(pal.hemiG); this.hemi.intensity = pal.hemiI;
    this.lamp.color.set(pal.lamp);
    this.lamp.castShadow = true;
    U.uVoid.value = pal.voidK;

    const [ax, az] = room.startA, [sx, sz] = room.startS;
    const f0 = Math.atan2(ax - sx, az - sz);
    this.bearer.reset(ax, az, f0);
    this.shade.reset(sx, sz, f0);
    this.shade.seq++;
    this.bearer.mesh.visible = true; this.bearer.lanternMesh.visible = true;
    this.shade.mesh.visible = true; this.shade.ring.visible = true;
    this.shade.fade = 1;
    this.shadeFadeTarget = undefined;
    if (this.p2) { this.p2 = null; }
    this.moth.visible = true; this.moth.target = null;
    this.moth.pos.set(ax, 2.2, az);
    this.lights = [this.bearer.light];
    if (room.beam) this.lights.push(room.beam.light);
    this.bigLight = null; this.lampLit = 0;

    if (def.lightning) {
      const d = new THREE.Vector3(...def.lightning.dir).normalize();
      this.lt = { dir: d, phase: 'idle', t: 4 + Math.random() * 2, interval: def.lightning.interval };
      const cx = room.W / 2, cz = room.H / 2;
      this.moon.position.set(cx - d.x * 20, -d.y * 20, cz - d.z * 20);
      this.moon.target.position.set(cx, 0, cz);
      this.moon.castShadow = true;
      this.moon.shadow.mapSize.set(this.lowPower ? 1024 : 2048, this.lowPower ? 1024 : 2048);
      const sc = this.moon.shadow.camera;
      const ext = Math.max(room.W, room.H) * 0.75 + 2;
      sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 60;
      sc.updateProjectionMatrix();
      this.moon.shadow.bias = -0.001;
      this.moon.intensity = 0.35;
      this.moonTarget = 0.35;
    } else {
      this.lt = null;
      this.moon.castShadow = false;
      this.moon.intensity = 0;
    }
    this.fx.setRain(!!def.rain);
    this.audio.setLoop('rain', def.rain ? 0.22 : 0, 1);
    this.audio.setLoop('sea', def.sea ? 0.18 : 0, 1);
    $('#bolt').classList.remove('on');

    $('#roomTitle').textContent = `${def.id} · ${def.title}`;
    $('#objective').textContent = def.objective || '';
    this.updateButtons();
    this.onLampMode();
    this.cam.x = (ax + sx) / 2; this.cam.z = (az + sz) / 2; this.cam.d = 24;
    this.updateCamera(1, true);
  }

  updateButtons(pop = false) {
    const show = (id, on) => {
      const el = $(id);
      const was = !el.classList.contains('hidden');
      el.classList.toggle('hidden', !on);
      if (on && !was && pop) el.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 500, easing: 'ease-out' });
    };
    const me0 = this.mode === 'local' || this.myRole === 0;
    const me1 = this.mode === 'local' || this.myRole === 1;
    show('#btnP1A', this.abil.height && me0);
    show('#btnP1B', (this.abil.place || !!this.room?.lamp) && me0);
    show('#btnP2A', this.abil.dash && me1);
  }
  onLampMode() {
    const L = this.bearer.lantern;
    const t = L.held ? (L.mode === 'high' ? '높이 듦' : '낮게 듦') : L.placed?.kind === 'pedestal' ? '걸어 둠' : '내려 둠';
    const lm = $('#lampMode');
    if (lm.textContent !== t) lm.textContent = t;
    const lb = $('#btnP1BLabel');
    const bl = L.held ? '놓기' : '줍기';
    if (lb.textContent !== bl) lb.textContent = bl;
    $('#btnP1A').classList.toggle('dim', !L.held);
  }

  // ================================================================ light / shadow queries (방장)
  exposure(x, z, y = 0.15) {
    let inRange = false, lit = false, warm = false;
    for (const L of this.lights) {
      if (!L.on) continue;
      const dx = x - L.x, dz = z - L.z;
      if (dx * dx + dz * dz > L.R * L.R) continue;
      inRange = true;
      if (L.type === 'beam') {
        const a = Math.atan2(dz, dx);
        let d = a - L.dirA;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) > L.half) continue;
      } else if (L.type === 'range') continue;
      if (!this.occ.blocked(x, y, z, L.x, L.y, L.z, L.ignore)) { lit = true; if (L.warm) warm = true; }
    }
    return { lit, inRange, warm };
  }
  lightningExposed(x, z, y = 0.15) {
    const d = this.lt.dir;
    return !this.occ.blocked(x, y, z, x - d.x * 30, y - d.y * 30, z - d.z * 30);
  }
  findSafeSpot(prefer) {
    const room = this.room, li = this.bearer.light, b = this.bearer;
    const nearHollow = (x, z) => room.hollows.some((h) => h.state === 'alive' && Math.hypot(h.pos.x - x, h.pos.y - z) < 2.5);
    const ok = (x, z) => {
      if (room.solidFor(Math.floor(x), Math.floor(z), 'shade')) return false;
      const e = this.exposure(x, z, 0.15);
      return e.inRange && !e.lit && !nearHollow(x, z);
    };
    if (ok(prefer.x, prefer.y)) return prefer.clone();
    let best = null, bd = 1e9;
    const R = Math.ceil(li.R);
    for (let tz = Math.floor(li.z) - R; tz <= Math.floor(li.z) + R; tz++) {
      for (let tx = Math.floor(li.x) - R; tx <= Math.floor(li.x) + R; tx++) {
        const x = tx + 0.5, z = tz + 0.5;
        if (Math.hypot(x - li.x, z - li.z) > li.R - 0.6) continue;
        if (!ok(x, z)) continue;
        const d = Math.hypot(x - prefer.x, z - prefer.y) + 0.5 * Math.hypot(x - b.pos.x, z - b.pos.y);
        if (d < bd) { bd = d; best = new THREE.Vector2(x, z); }
      }
    }
    if (best) return best;
    const bx = b.pos.x - Math.sin(b.face) * 0.8, bz = b.pos.y - Math.cos(b.face) * 0.8;
    if (!room.solidFor(Math.floor(bx), Math.floor(bz), 'shade')) return new THREE.Vector2(bx, bz);
    return b.pos.clone();
  }

  // ================================================================ events from entities
  toast(t, d) { this.D.toast(t, d); }
  shake(a) {
    this.cam.shake = Math.max(this.cam.shake, a);
    if (this.capturing) this.evq.push(['s', a]);
  }
  onShadeBurn() {
    if (!this.flags.burnTip) { this.flags.burnTip = true; this.toast('<b class="p2">그림자</b>가 빛에 타고 있어요! 그늘로 피해요'); }
  }
  onShadeFar() {
    if (!this.flags.farTip) { this.flags.farTip = true; this.toast('등불에서 너무 멀어지면 <b class="p2">그림자</b>가 흐려져요'); }
  }
  onShadeDissolve() {
    this.flags.dissolves = (this.flags.dissolves || 0) + 1;
    if (this.flags.dissolves === 2) this.toast('막히면 가운데 ❚❚ 메뉴에서 💡 힌트를 볼 수 있어요', 3400);
  }
  onFlower() {}
  onDoorOpen() {}
  onHollowDie() {
    if (this.room.hollows.every((h) => h.state !== 'alive') && this.room.hollows.length) this.toast('잊음을 모두 물리쳤어요!');
  }
  onMemoryReveal() { this.toast('마지막 추억 조각이 나타났어요'); }
  onMemory(mem) {
    this.cutscene(async () => {
      await STORY.memories[mem.id]?.(this.S);
      const obj = this.room.lamp ? '1P · 등대 램프 옆에서 ✋' : '출구가 열렸어요! 둘이 함께 출구로';
      $('#objective').textContent = obj;
      this.updateButtons(true);
      this.sendUI({ op: 'buttons' });
      this.sendUI({ op: 'obj', text: obj });
    });
  }
  onGreatLamp() {
    this.cutscene(async () => { await STORY.finale(this.S); }, true);
  }
  async cutscene(fn, keepFrozen = false) {
    if (this.inCut) return;
    this.inCut = true;
    this.frozen = true;
    this.state = 'story';
    try { await fn(); } finally {
      this.inCut = false;
      if (!keepFrozen) { this.frozen = false; this.state = 'play'; this.input.flush(); }
    }
  }
  vibrate(p) { if (navigator.vibrate) try { navigator.vibrate(p); } catch { /* ignore */ } }

  // 하트 이모트: 내 캐릭터 머리 위에 ♥
  emote(role, kind, fromMe) {
    const ch = role === 0 ? this.bearer : this.shade;
    if (!this.room) return;
    this.emotes.show(ch, kind);
    this.playRaw('love');
    if (fromMe && this.net && this.net.connected) this.net.send({ t: 'emote', role, kind });
  }

  // ================================================================ script API
  get S() {
    if (this._S) return this._S;
    const g = this, ui = this.ui, D = this.D;
    const wait = (s) => new Promise((r) => setTimeout(r, ui.auto ? 5 : s * 1000));
    this._S = {
      say: (who, text) => D.say(who, text),
      choose: (who, opts, prompt) => D.choose(who, opts, prompt),
      photo: (id) => D.photo(id),
      narrate: (lines, o) => D.narrate(lines, o),
      card: (ch) => D.card(ch),
      hold: (p, s) => D.hold(p, s),
      wait,
      toast: (t, d) => D.toast(t, d),
      focusBearer: (d = 16) => { g.camFocus = { who: 'bearer', d }; },
      focusShade: (d = 15) => { g.camFocus = { who: 'shade', d }; },
      focusBoth: (d = 16) => { g.camFocus = { who: 'both', d }; },
      focusHollows: () => {
        const hs = g.room.hollows;
        if (!hs.length) return;
        let x = 0, z = 0;
        for (const h of hs) { x += h.pos.x; z += h.pos.y; }
        g.camFocus = { x: x / hs.length, z: z / hs.length, d: 23 };
      },
      release: () => g.release(),
      tutorial: (l, r) => { g.showTutorial(l, r); g.sendUI({ op: 'tut', l, r }); },
      showButtons: () => { g.updateButtons(true); g.sendUI({ op: 'buttons' }); },
      chapterQuiz: (n, q, o1, o2, yes, no) => g.chapterQuiz(n, q, o1, o2, yes, no),
      lampBurst: () => { g.lampBurst(); g.sendUI({ op: 'lampBurst' }); },
      shadeFade: (v) => { g.shadeFadeTarget = v; },
      reveal: () => { g.revealB(); g.sendUI({ op: 'reveal' }); },
      flashback: () => D.narrate(['벚꽃 아래 버스 정류장.', '세 번이나 탄 회전목마.', '코코아 두 잔.', '그리고, 비 오는 밤.'], { bg: 'rgba(3,2,5,.82)' }),
      mothToB: () => { g.mothToB(); g.sendUI({ op: 'mothToB' }); },
      whiteOut: async () => { g.audio.play('shine'); g.sendUI({ op: 'song', s: 'end' }); await D.fade(1, 2200, true); },
      hospital: () => g.playHospital(),
    };
    return this._S;
  }
  release() { this.camFocus = null; }

  showTutorial(l, r) {
    const L = $('#tutL'), R = $('#tutR');
    const online = this.mode !== 'local';
    L.querySelector('p').textContent = online ? '화면 아무 곳이나 드래그해서\n내 캐릭터를 움직여요' : l;
    R.querySelector('p').textContent = r;
    L.classList.remove('hidden');
    R.classList.toggle('hidden', online);
    this.input.moved = [false, false];
    this.tutOn = true;
  }
  hideTutorial() {
    $('#tutL').classList.add('hidden'); $('#tutR').classList.add('hidden');
    this.tutOn = false;
  }

  async chapterQuiz(n, q, o1, o2, yes, no) {
    const D = this.D;
    const online = this.mode !== 'local';
    await D.say('sys', online ? `💞 커플 문답 ${n}\n각자 자기 폰에서 몰래 골라 보세요!` : `💞 커플 문답 ${n}\n각자 자기 쪽 화면에서, 서로 안 보이게 골라 보세요!`);
    const [a, b] = await D.choose('both', [o1, o2], q);
    const pa = a === 0 ? 'A' : 'B';
    const pb = b === 0 ? 'B' : 'A';
    const match = pa === pb;
    this.quiz = this.quiz || [];
    this.quiz[n - 1] = match;
    this.capturing = this.mode === 'host';
    this.audio.play(match ? 'match' : 'mismatch');
    if (match) for (let k = 0; k < 2; k++) this.fx.burst(this.bearer.pos.x, 1.5, this.bearer.pos.y, 30, 0xff9fc8, 3, 1.2, 0.25);
    this.capturing = false;
    const who = (p) => (p === 'A' ? '{A}' : '그림자');
    await D.say('sys', `1P의 답: ${who(pa)}   ·   2P의 답: ${who(pb)}\n${match ? '💞 일치!' : '💔 불일치!'}`);
    await D.say('moth', match ? yes : no);
  }

  // ================================================================ finale helpers (양쪽 폰에서 같은 연출)
  lampBurst() {
    const room = this.room, lamp = room.lamp;
    this.playRaw('shine');
    this.ui.flash(0.9);
    this.cam.shake = 0.4;
    this.bearer.lantern.held = false;
    this.bearer.lantern.placed = { kind: 'pedestal', x: lamp.x, z: lamp.z, y: 1.8, R: 14 };
    this.bearer.lanternMesh.visible = false;
    this.bigLight = new THREE.PointLight(0xfff0d0, 0, 30, 1.0);
    this.bigLight.position.set(lamp.x, 2.4, lamp.z);
    room.group.add(this.bigLight);
    this.lampLit = 0;
    for (let k = 0; k < 4; k++) this.fxRaw.burst(lamp.x, 1.8, lamp.z, 40, k % 2 ? 0xffe0a0 : 0xffffff, 5, 1.8, 0.3);
    if (this.isHost) for (const h of room.hollows) if (h.state === 'alive') h.kill();
  }
  revealB() {
    const s = this.shade;
    this.playRaw('memory');
    this.ui.flash(0.7);
    const p2 = makeCharacter('person2');
    p2.position.copy(s.mesh.position);
    p2.rotation.y = s.face;
    p2.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material.transparent = true; o.material.opacity = 0; } });
    this.room.group.add(p2);
    this.p2 = p2;
    this.p2Fade = 0;
    this.fxRaw.burst(s.pos.x, 0.8, s.pos.y, 60, 0xff9fc8, 3, 1.6, 0.3);
    $('#p2name').textContent = this.ui.names.B;
  }
  mothToB() {
    const s = this.shade;
    this.moth.target = new THREE.Vector3(s.pos.x, 1.2, s.pos.y);
    setTimeout(() => {
      this.fxRaw.burst(s.pos.x, 1.2, s.pos.y, 40, 0xfff0b0, 2.5, 1.4, 0.25);
      this.moth.visible = false;
      this.playRaw('latch');
    }, this.ui.auto ? 5 : 1400);
  }
  async playHospital(guest = false) {
    this.state = 'ending';
    $('#hud').classList.add('hidden');
    if (this.room) { this.room.dispose(); this.room = null; }
    this.bearer.mesh.visible = false; this.bearer.lanternMesh.visible = false; this.bearer.arm.visible = false;
    this.shade.mesh.visible = false; this.shade.ring.visible = false; this.moth.visible = false;
    this.fx.clear(); this.fx.setRain(false);
    this.lamp.intensity = 0; this.lamp.castShadow = false; this.hemi.intensity = 0;
    this.moon.intensity = 0; this.moon.castShadow = false;
    this.scene.fog.near = 50; this.scene.fog.far = 200;
    U.uVoid.value = 1;
    this.audio.setLoop('sea', 0, 1); this.audio.setLoop('rain', 0, 1); this.audio.setLoop('burn', 0, 0.2);
    this.audio.setSong('end');
    $('#app').style.background = 'linear-gradient(#fff3e6, #f7d9c4)';
    this.hospital = new Hospital(this);
    if (guest) return;
    this.sendUI({ op: 'hosp' });
    const S = this.S, H = this.hospital;
    const hset = (k, v) => { H[k] = v; this.sendUI({ op: 'hospSet', k, v }); };
    await this.D.fade(0, 2500, true);
    await S.say('narr', '— 백 일째 아침 —');
    await S.wait(0.8);
    await S.say('B', '……{A:아}?');
    hset('eyeOpen', 0.35);
    await S.wait(0.9);
    hset('eyeOpen', 1);
    await S.say('B', '{A:아}!');
    await S.say('A', '……오늘, 날씨 좋다.');
    await S.say('B', '……응. 진짜 좋아.');
    hset('camKTarget', 1);
    await S.wait(2.6);
    await S.say('narr', '빛이 있는 곳엔, 언제나 그림자가 있다.');
    await S.wait(1.2);
    this.showEndCard();
    this.sendUI({ op: 'end', quiz: this.quiz });
    if (this.resolveRoom) this.resolveRoom('final');
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
  showEndCard() {
    const q = this.quiz || [];
    const n = q.filter(Boolean).length;
    const comments = ['정반대라서 끌리는 사이', '서로 알아갈 게 많아서 더 설레는 사이', '반반의 매력, 딱 좋은 사이', '찰떡궁합!', '천생연분! 등대보다 밝은 커플'];
    $('#ending .ecredit').innerHTML = `플레이해 줘서 고마워요, <b style="color:#ffc46b">${this.ui.names.A}</b> & <b style="color:#ff9fc8">${this.ui.names.B}</b>.<br/>오늘은 서로에게 "고마워"라고 말해 주세요.`;
    $('#ending .escore').innerHTML = `💞 커플 문답 일치 <b>${n} / 4</b> — ${comments[n]}`;
    $('#ending').classList.remove('hidden');
    $('#btnAgain').onclick = () => location.reload();
  }

  // ================================================================ per-frame
  resetScroll() {
    try { document.activeElement?.blur?.(); } catch { /* ignore */ }
    const app = document.getElementById('app');
    app.scrollTop = 0; app.scrollLeft = 0;
    window.scrollTo(0, 0);
  }
  resize() {
    this.resetScroll();
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.setScale(h * this.renderer.getPixelRatio());
  }

  updateCamera(dt, instant = false) {
    const b = this.bearer, s = this.shade, li = b.light, cam = this.cam;
    let tx, tz, td;
    const F = this.camFocus;
    if (F) {
      if (F.who === 'bearer') { tx = b.pos.x; tz = b.pos.y; }
      else if (F.who === 'shade') { tx = s.pos.x; tz = s.pos.y; }
      else if (F.who === 'both') { tx = (b.pos.x + s.pos.x) / 2; tz = (b.pos.y + s.pos.y) / 2; }
      else { tx = F.x; tz = F.z; }
      td = F.d;
    } else {
      const xs = [b.pos.x, li.x - li.R * 0.55, li.x + li.R * 0.55], zs = [b.pos.y, li.z - li.R * 0.4, li.z + li.R * 0.4];
      if (s.alive) { xs.push(s.pos.x); zs.push(s.pos.y); }
      if (this.room) {
        for (const f of this.room.flowers) {
          if (!f.active && Math.hypot(f.x - li.x, f.z - li.z) < li.R + 3) { xs.push(f.x); zs.push(f.z); }
        }
      }
      const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
      tx = (minX + maxX) / 2; tz = (minZ + maxZ) / 2;
      const vf = (this.camera.fov * Math.PI) / 360;
      const hf = Math.atan(Math.tan(vf) * this.camera.aspect);
      const dX = (maxX - minX + 5) / 2 / Math.tan(hf);
      const dZ = ((maxZ - minZ + 4) / 2 / Math.tan(vf)) * 0.9;
      td = clamp(Math.max(dX, dZ, 23), 23, 38);
    }
    if (this.room && !F) {
      const W = this.room.W, H = this.room.H;
      const hw = td * Math.tan(Math.atan(Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect)) * 0.78;
      const hz = td * Math.tan((this.camera.fov * Math.PI) / 360) * 0.95;
      tx = W > hw * 2 ? clamp(tx, hw - 0.5, W - hw + 0.5) : W / 2;
      tz = H > hz * 2 ? clamp(tz, hz - 1.5, H - hz + 0.5) : H / 2 - 0.6;
    }
    if (instant) { cam.x = tx; cam.z = tz; cam.d = td; }
    else {
      cam.x = damp(cam.x, tx, 3.2, dt); cam.z = damp(cam.z, tz, 3.2, dt); cam.d = damp(cam.d, td, 2.2, dt);
    }
    const sh = cam.shake;
    cam.shake = Math.max(0, cam.shake - dt * 1.5);
    const ox = (Math.random() - 0.5) * sh, oz = (Math.random() - 0.5) * sh;
    this.camera.position.set(cam.x + ox, Math.sin(PITCH) * cam.d, cam.z + 1.1 + Math.cos(PITCH) * cam.d + oz);
    this.camera.lookAt(cam.x + ox * 0.5, 0, cam.z + 1.1 + oz * 0.5);
  }

  updateLightning(dt) {
    const lt = this.lt;
    if (!lt) return;
    if (!this.isHost) { this.moon.intensity = damp(this.moon.intensity, this.moonTarget ?? 0.35, 12, dt); return; }
    if (this.frozen) { this.moon.intensity = damp(this.moon.intensity, 0.35, 4, dt); return; }
    lt.t -= dt;
    if (lt.phase === 'idle') {
      this.moon.intensity = damp(this.moon.intensity, 0.35, 4, dt);
      if (lt.t <= 0) { lt.phase = 'warn'; lt.t = 1.5; $('#bolt').classList.add('on'); this.audio.play('warn'); }
    } else if (lt.phase === 'warn') {
      this.moon.intensity = 0.35 + Math.random() * 0.25;
      if (lt.t <= 0) {
        lt.phase = 'flash'; lt.t = 0.4;
        $('#bolt').classList.remove('on');
        this.ui.flash(0.55);
        if (this.capturing) this.evq.push(['fl', 0.55]);
        this.audio.play('thunder');
        this.shake(0.3);
        this.moon.intensity = 6;
        const s = this.shade;
        if (s.alive && !s.dashing && s.invuln <= 0 && this.lightningExposed(s.pos.x, s.pos.y)) {
          s.hp -= 0.55;
          this.fx.burst(s.pos.x, 0.8, s.pos.y, 20, 0xdfeaff, 3, 0.8, 0.22);
          if (!this.flags.boltTip) { this.flags.boltTip = true; this.toast('번개에 들켰어요! 다음엔 벽의 오른쪽 아래에 숨어요'); }
          if (s.hp <= 0) s.dissolve();
        }
        for (const h of this.room.hollows) if (h.state === 'alive' && this.lightningExposed(h.pos.x, h.pos.y, 0.5)) h.kill();
      }
    } else if (lt.phase === 'flash') {
      this.moon.intensity = lt.t > 0.25 ? 6 : lt.t > 0.15 ? 1 : 4;
      if (lt.t <= 0) { lt.phase = 'idle'; lt.t = lt.interval[0] + Math.random() * (lt.interval[1] - lt.interval[0]); }
    }
  }

  updateHUD() {
    const s = this.shade;
    const hp = $('#hpFill');
    hp.style.width = (Math.max(0, s.hp) * 100).toFixed(1) + '%';
    hp.classList.toggle('low', s.hp < 0.35);
    const burn = $('#burnR');
    const burning = this.state === 'play' && s.alive && !this.frozen && (s.lit || s.far) && !s.dashing && s.invuln <= 0;
    const iSeeShadeBurn = this.mode === 'local' || this.myRole === 1;
    burn.style.opacity = burning && iSeeShadeBurn ? (0.5 + (1 - s.hp) * 0.5).toFixed(2) : '0';
    burn.classList.toggle('far', !s.lit && s.far);
    burn.classList.toggle('full', this.mode !== 'local');
    $('#btnP2A').style.setProperty('--cd', ((s.cd / CFG.DASH_CD) * 100).toFixed(0) + '%');
    this.audio.setLoop('burn', burning && s.lit ? 0.12 : 0, 0.05);
    if (this.tutOn) {
      const online = this.mode !== 'local';
      if (online ? this.input.moved[this.myRole] : this.input.moved[0]) $('#tutL').classList.add('hidden');
      if (this.input.moved[1]) $('#tutR').classList.add('hidden');
      if (online ? this.input.moved[this.myRole] : this.input.moved[0] && this.input.moved[1]) this.tutOn = false;
    }
    if (this.net) {
      const nb = $('#netBadge');
      nb.classList.remove('hidden');
      const rtt = Math.round(this.net.rtt);
      nb.textContent = this.net.connected ? `● 연결됨 ${rtt ? rtt + 'ms' : ''}` : '● 연결 끊김';
      nb.classList.toggle('bad', !this.net.connected || rtt > 300);
    }
  }

  frame() {
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (dt > 0.05) dt = 0.05;
    if (this.paused) dt = 0;
    this.time += dt;
    this.input.update();

    if (this.hospital) {
      this.hospital.update(dt);
      this.fx.update(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const host = this.isHost;
    if (this.room && dt > 0) {
      if (this.frozen) this.input.flush();
      const inp = (r) => (this.frozen ? ZERO_INPUT : this.input.p[r]);
      // 1) 내 캐릭터는 내 폰에서 바로 움직여요 (지연 없는 조작감), 상대 캐릭터는 부드럽게 따라가요
      if (this.owns(0)) this.bearer.control(dt, inp(0)); else this.bearer.follow(dt);
      if (this.owns(1)) this.shade.control(dt, inp(1)); else this.shade.follow(dt);
      if (this.owns(0) && !this.frozen && this.state === 'play') {
        const P = this.input.p[0];
        if (P.aPressed && this.abil.height) this.cmd('height');
        if (P.bPressed) this.cmd('useB');
      }
      this.bearer.updateLight(dt);
      this.room.animate(dt);
      // 2) 판정은 방장만
      if (host) {
        this.capturing = this.mode === 'host';
        this.bearer.logic(dt, this.owns(0) ? inp(0) : this.frozen ? ZERO_INPUT : this.remoteIn);
        this.shade.logic(dt);
        this.room.logic(dt);
        this.updateLightning(dt);
        this.capturing = false;
      } else {
        this.updateLightning(dt);
      }
      this.moth.update(dt);
      // 3) 표현은 양쪽 모두
      this.bearer.visual(dt);
      this.shade.visual(dt);
      this.room.visual(dt);
      this.emotes.update(dt);
      if (host && this.shadeFadeTarget !== undefined) this.shade.fade = damp(this.shade.fade, this.shadeFadeTarget, 1.2, dt);
      if (this.p2) {
        this.p2Fade = Math.min(1, this.p2Fade + dt * 0.5);
        this.p2.traverse((o) => { if (o.isMesh) o.material.opacity = this.p2Fade; });
        if (host) this.shade.fade = Math.max(0, 1 - this.p2Fade * 1.2);
      }
    }
    // 등불 빛 적용
    const li = this.bearer.light;
    const t = this.time;
    const flick = 1 + Math.sin(t * 13.7) * 0.03 + Math.sin(t * 7.1) * 0.03;
    this.lamp.position.set(li.x, li.y, li.z);
    this.lamp.distance = li.R + 1.5;
    this.lamp.shadow.camera.far = li.R + 2;
    const L = this.bearer.lantern;
    const baseI = L.held ? (L.mode === 'high' ? 11 : 8.5) : L.placed?.kind === 'pedestal' ? 14 : 6.5;
    this.lamp.intensity = baseI * flick;
    U.uL1.value.set(li.x, li.y, li.z, li.R);
    const beam = this.room?.beam;
    if (this.bigLight) {
      if (host) this.lampLit = Math.min(1, (this.lampLit || 0) + dt * 0.4);
      else this.lampLit = Math.min(1, (this.lampLit || 0) + dt * 0.4);
      this.bigLight.intensity = this.lampLit * 40;
      if (this.room?.lamp) this.room.lamp.lit = this.lampLit;
      if (this.room?.lamp) U.uL2.value.set(this.room.lamp.x, 2, this.room.lamp.z, 4 + this.lampLit * 30);
      this.hemi.intensity = damp(this.hemi.intensity, 1.4, 1, dt);
    } else if (beam) U.uL2.value.set(beam.x, beam.light.y, beam.z, beam.R);
    else U.uL2.value.set(0, 0, 0, 0);
    if (this.room && li.R > 0) this.fx.dust(dt, li.x, li.y, li.z, li.R, 0xffd9a0);
    if (this.room) this.ambient(dt);
    this.updateCamera(dt || 0.016);
    this.fx.updateRain(dt, this.cam.x, this.cam.z);
    this.fx.update(dt);
    this.updateHUD();
    if (this.state === 'title' && this.room) this.titleIdle(dt);
    this.renderer.render(this.scene, this.camera);

    // 네트워크 송신: 방장 20Hz 스냅샷, 참가자 30Hz 조작
    if (this.net && this.net.connected && this.state !== 'title') {
      this.sendT -= dt || 0.016;
      if (this.sendT <= 0) {
        if (this.mode === 'host') { this.sendT = 0.05; this.sendSnapshot(); }
        else if (this.mode === 'guest') { this.sendT = 0.033; this.sendInput(); }
      }
    } else if (this.mode === 'host') this.evq.length = 0;
  }

  // 챕터별 공기: 재, 색종이, 먼지, 물보라
  ambient(dt) {
    const ch = ROOMS[this.roomIdx]?.ch;
    this.ambT = (this.ambT || 0) + dt;
    const rate = ch === 4 ? 0 : 0.12;
    if (!rate) return;
    while (this.ambT > rate) {
      this.ambT -= rate;
      const x = this.cam.x + (Math.random() - 0.5) * 30, z = this.cam.z + (Math.random() - 0.5) * 18;
      if (ch === 1) this.fxRaw.spark(x, 3 + Math.random() * 3, z, 0x9a9aa8, 0.07, 5);
      else if (ch === 2) this.fx.glow.emit({ x, y: 4 + Math.random() * 2, z, vx: (Math.random() - 0.5) * 0.4, vy: -0.5, vz: (Math.random() - 0.5) * 0.4, life: 6, size: 0.09, color: [0xff8fb8, 0x8fd0ff, 0xffe08f, 0xb49bff][Math.floor(Math.random() * 4)], alpha: 0.8, drag: 0.3, flick: 6 });
      else if (ch === 3) this.fxRaw.spark(x, 0.5 + Math.random() * 3, z, 0xffd9a8, 0.06, 4);
      else if (ch === 5) this.fx.glow.emit({ x, y: 0.2 + Math.random() * 2, z, vx: 0.4, vy: 0.1, vz: 0.2, life: 4, size: 0.07, color: 0xfff2e0, alpha: 0.7, drag: 0.1, flick: 4 });
    }
  }

  titleIdle(dt) {
    const b = this.bearer, s = this.shade;
    const t = this.time;
    b.face = Math.PI / 2 + Math.sin(t * 0.4) * 0.6;
    s.pos.x = damp(s.pos.x, b.pos.x - Math.sin(b.face) * 1.0, 2, dt);
    s.pos.y = damp(s.pos.y, b.pos.y - Math.cos(b.face) * 1.0, 2, dt);
    s.face = b.face;
    this.cam.d = 13;
  }
}
