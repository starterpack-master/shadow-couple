import * as THREE from 'three';
import { CFG, IS_MOBILE, clamp, damp } from './config.js';
import { Occluders } from './shadow.js';
import { U, PAL } from './materials.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { UI } from './ui.js';
import { FX } from './fx.js';
import { Room } from './room.js';
import { Bearer, Shade, Moth } from './entities.js';
import { ROOMS } from './levels.js';
import { STORY } from './story.js';
import { Hospital } from './ending.js';
import { makeCharacter } from './models.js';

const $ = (s) => document.querySelector(s);
const PITCH = (57 * Math.PI) / 180;
const SAVE_KEY = 'iwbys_save_v1';

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
    this.scene.fog = new THREE.Fog(0x1d2130, 22, 60);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 320);
    this.cam = { x: 0, z: 0, d: 14, shake: 0 };

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
    this.moon.castShadow = false;
    this.scene.add(this.moon, this.moon.target);

    this.occ = new Occluders();
    this.input = new Input();
    this.audio = new AudioSys();
    this.ui = new UI(this);
    this.fx = new FX(this.scene);
    this.bearer = new Bearer(this);
    this.shade = new Shade(this);
    this.moth = new Moth(this);

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

    if (params.has('auto')) this.ui.auto = true;
    this.input.onKey = (code) => {
      if (this.ui.choiceKey) this.ui.choiceKey(code);
      if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') this.ui.tapDialog();
      if (code === 'Escape' && this.state === 'play') this.toggleMenu();
    };

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

  // ================================================================ save
  loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch { return null; }
  }
  writeSave(room) {
    this.save = { room, names: this.ui.names, quiz: this.quiz || [] };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* ignore */ }
  }

  // ================================================================ title & menu
  setupTitle() {
    const A = $('#nameA'), B = $('#nameB');
    if (this.save?.names) { A.value = this.save.names.A; B.value = this.save.names.B; }
    const cont = $('#btnContinue');
    if (this.save && this.save.room > 0 && this.save.room < ROOMS.length) {
      cont.classList.remove('hidden');
      cont.textContent = `이어하기 (${ROOMS[this.save.room].id} ${ROOMS[this.save.room].title})`;
    }
    const begin = async (fromSave) => {
      this.audio.init();
      this.tryFullscreen();
      this.ui.names = { A: (A.value || A.placeholder).trim() || '해솔', B: (B.value || B.placeholder).trim() || '다온' };
      $('#p1name').textContent = this.ui.names.A;
      $('#p2name').textContent = '그림자';
      $('#title').classList.add('hidden');
      this.quiz = fromSave ? this.save?.quiz || [] : [];
      const start = fromSave ? this.save.room : 0;
      this.run(start, !fromSave);
    };
    $('#btnStart').addEventListener('click', () => begin(false));
    cont.addEventListener('click', () => begin(true));
    const startIdx = this.params.get('room');
    if (startIdx !== null) {
      const i = ROOMS.findIndex((r) => r.id === startIdx);
      const idx = i >= 0 ? i : parseInt(startIdx, 10) || 0;
      this.save = { room: idx, names: { A: '해솔', B: '다온' }, quiz: [] };
      if (this.params.has('go')) setTimeout(() => begin(true), 50);
    }
  }
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
      else if (act === 'hint') { const h = menu.querySelector('.hint'); h.textContent = '💡 ' + (this.room?.def.hint || ''); h.classList.add('on'); }
      else if (act === 'restart') { this.toggleMenu(false); this.resolveRoom?.('restart'); }
      else if (act === 'skip') { if (confirm('이 방을 건너뛸까요?')) { this.toggleMenu(false); this.resolveRoom?.('skip'); } }
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
    this.paused = open;
  }

  // ================================================================ main flow
  async run(start, withPrologue) {
    this.state = 'story';
    if (withPrologue) {
      await this.ui.fade(1, 500);
      await STORY.prologue(this.S);
    }
    for (let i = start; i < ROOMS.length; i++) {
      const res = await this.playRoom(i);
      if (res === 'final') return;
    }
  }

  async playRoom(i, skipIntro = false) {
    const def = ROOMS[i];
    await this.ui.fade(1, 500);
    this.loadRoom(i);
    this.writeSave(i);
    this.audio.setSong(def.ch);
    await this.ui.fade(0, 700);
    this.frozen = true;
    this.state = 'story';
    $('#hud').classList.remove('hidden');
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
    if (res !== 'skip') { this.audio.play('complete'); this.celebrate(); await this.S.wait(0.9); }
    this.hideTutorial();
    if (script?.outro) await script.outro(this.S);
    this.writeSave(i + 1);
    return res;
  }

  completeRoom() {
    if (this.resolveRoom) this.resolveRoom('done');
  }

  celebrate() {
    const e = this.room.exit;
    if (!e) return;
    for (let k = 0; k < 3; k++) this.fx.burst(e.cx, 0.5 + k * 0.4, e.cz, 20, k % 2 ? 0xffd9a0 : 0xc9b6ff, 3, 1.2, 0.25);
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
    this.flags.roomTips = {};
    const room = (this.room = new Room(this, def));
    this.abil = { ...def.abil };
    const pal = PAL[def.ch];
    $('#app').style.background = `linear-gradient(${pal.sky[0]}, ${pal.sky[1]})`;
    this.scene.fog.color.set(pal.fog);
    this.scene.fog.near = 26; this.scene.fog.far = 75;
    this.hemi.color.set(pal.hemiS); this.hemi.groundColor.set(pal.hemiG); this.hemi.intensity = pal.hemiI;
    this.lamp.color.set(pal.lamp);
    U.uVoid.value = pal.voidK;

    // 캐릭터 배치
    const [ax, az] = room.startA, [sx, sz] = room.startS;
    const f0 = Math.atan2(ax - sx, az - sz);
    this.bearer.reset(ax, az, f0);
    this.shade.reset(sx, sz, f0);
    this.bearer.mesh.visible = true; this.bearer.lanternMesh.visible = true;
    this.shade.mesh.visible = true; this.shade.ring.visible = true;
    this.shade.fade = 1;
    this.moth.visible = true; this.moth.target = null;
    this.moth.pos.set(ax, 2.2, az);
    this.lights = [this.bearer.light];
    if (room.beam) this.lights.push(room.beam.light);
    this.bigLight = null;

    // 번개
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
    } else {
      this.lt = null;
      this.moon.castShadow = false;
      this.moon.intensity = 0;
    }
    this.fx.setRain(!!def.rain);
    this.audio.setLoop('rain', def.rain ? 0.22 : 0, 1);
    this.audio.setLoop('sea', def.sea ? 0.18 : 0, 1);
    $('#bolt').classList.remove('on');

    // HUD
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
      if (on && !was && pop) { el.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 500, easing: 'ease-out' }); }
    };
    show('#btnP1A', this.abil.height);
    show('#btnP1B', this.abil.place || !!this.room?.lamp);
    show('#btnP2A', this.abil.dash);
  }
  onLampMode() {
    const L = this.bearer.lantern;
    let t = L.held ? (L.mode === 'high' ? '높이 듦' : '낮게 듦') : L.placed?.kind === 'pedestal' ? '걸어 둠' : '내려 둠';
    $('#lampMode').textContent = t;
    $('#btnP1BLabel').textContent = L.held ? '놓기' : '줍기';
    $('#btnP1A').classList.toggle('dim', !L.held);
  }

  // ================================================================ light / shadow queries
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
  toast(t, d) { this.ui.toast(t, d); }
  shake(a) { this.cam.shake = Math.max(this.cam.shake, a); }
  onShadeBurn() {
    if (!this.flags.burnTip) { this.flags.burnTip = true; this.toast('<b class="p2">그림자</b>가 빛에 타고 있어요! 그늘로 피해요'); }
    if (navigator.vibrate && Math.random() < 0.05) navigator.vibrate(15);
  }
  onShadeFar() {
    if (!this.flags.farTip) { this.flags.farTip = true; this.toast('등불에서 너무 멀어지면 <b class="p2">그림자</b>가 흐려져요'); }
  }
  onShadeDissolve() {
    if (navigator.vibrate) navigator.vibrate([40, 40, 60]);
    this.flags.dissolves = (this.flags.dissolves || 0) + 1;
    if (this.flags.dissolves === 2) this.toast('막히면 가운데 ❚❚ 메뉴에서 💡 힌트를 볼 수 있어요', 3400);
  }
  onFlower() {}
  onDoorOpen() {}
  onHollowDie() {
    if (this.room.hollows.every((h) => h.state !== 'alive') && this.room.hollows.length) this.toast('잊음을 모두 물리쳤어요!');
  }
  onMemoryReveal() {
    this.toast('마지막 추억 조각이 나타났어요');
  }
  onMemory(mem) {
    this.cutscene(async () => {
      await STORY.memories[mem.id]?.(this.S);
      $('#objective').textContent = this.room.lamp ? '1P · 등대 램프 옆에서 ✋' : '출구가 열렸어요! 둘이 함께 출구로';
      this.updateButtons(true);
    });
  }
  onGreatLamp() {
    this.cutscene(async () => {
      await STORY.finale(this.S);
    }, true);
  }
  async cutscene(fn, keepFrozen = false) {
    if (this.inCut) return;
    this.inCut = true;
    this.frozen = true;
    const prev = this.state;
    this.state = 'story';
    try { await fn(); } finally {
      this.inCut = false;
      if (!keepFrozen) { this.frozen = false; this.state = prev === 'story' ? 'play' : prev; this.input.flush(); }
    }
  }

  // ================================================================ script API
  get S() {
    if (this._S) return this._S;
    const g = this, ui = this.ui;
    const wait = (s) => new Promise((r) => setTimeout(r, ui.auto ? 5 : s * 1000));
    this._S = {
      say: (who, text) => ui.say(who, text),
      choose: (who, opts, prompt) => ui.choose(who, opts, prompt),
      photo: (id) => ui.photo(id),
      narrate: (lines, o) => ui.narrate(lines, o),
      card: (ch) => ui.card(ch),
      hold: (p, s) => ui.hold(p, s),
      wait,
      toast: (t, d) => ui.toast(t, d),
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
      tutorial: (l, r) => g.showTutorial(l, r),
      showButtons: () => g.updateButtons(true),
      chapterQuiz: (n, q, o1, o2, yes, no) => g.chapterQuiz(n, q, o1, o2, yes, no),
      lampBurst: () => g.lampBurst(),
      shadeFade: (v) => { g.shadeFadeTarget = v; },
      reveal: () => g.revealB(),
      flashback: () => ui.narrate(['벚꽃 아래 버스 정류장.', '세 번이나 탄 회전목마.', '코코아 두 잔.', '그리고, 비 오는 밤.'], { bg: 'rgba(3,2,5,.82)' }),
      mothToB: () => g.mothToB(),
      whiteOut: async () => { g.audio.play('shine'); await ui.fade(1, 2200, true); },
      hospital: () => g.playHospital(),
    };
    return this._S;
  }
  release() { this.camFocus = null; }

  showTutorial(l, r) {
    const L = $('#tutL'), R = $('#tutR');
    L.querySelector('p').textContent = l; R.querySelector('p').textContent = r;
    L.classList.remove('hidden'); R.classList.remove('hidden');
    this.input.moved = [false, false];
    this.tutOn = true;
  }
  hideTutorial() {
    $('#tutL').classList.add('hidden'); $('#tutR').classList.add('hidden');
    this.tutOn = false;
  }

  async chapterQuiz(n, q, o1, o2, yes, no) {
    const ui = this.ui;
    await ui.say('sys', `💞 커플 문답 ${n}\n각자 자기 쪽 화면에서, 서로 안 보이게 골라 보세요!`);
    const [a, b] = await ui.choose('both', [o1, o2], q);
    const pa = a === 0 ? 'A' : 'B';
    const pb = b === 0 ? 'B' : 'A';
    const match = pa === pb;
    this.quiz = this.quiz || [];
    this.quiz[n - 1] = match;
    this.audio.play(match ? 'match' : 'mismatch');
    if (match) for (let k = 0; k < 2; k++) this.fx.burst(this.bearer.pos.x, 1.5, this.bearer.pos.y, 30, 0xff9fc8, 3, 1.2, 0.25);
    const who = (p) => (p === 'A' ? '{A}' : '그림자');
    await ui.say('sys', `1P의 답: ${who(pa)}   ·   2P의 답: ${who(pb)}\n${match ? '💞 일치!' : '💔 불일치!'}`);
    await ui.say('moth', match ? yes : no);
  }

  // ================================================================ finale helpers
  lampBurst() {
    const room = this.room, lamp = room.lamp;
    this.audio.play('shine');
    this.ui.flash(0.9);
    this.shake(0.4);
    this.bearer.lantern.held = false;
    this.bearer.lantern.placed = { kind: 'pedestal', x: lamp.x, z: lamp.z, y: 1.8, R: 14 };
    this.bearer.lanternMesh.visible = false;
    this.bigLight = new THREE.PointLight(0xfff0d0, 0, 30, 1.0);
    this.bigLight.position.set(lamp.x, 2.4, lamp.z);
    room.group.add(this.bigLight);
    this.lampLit = 0;
    for (let k = 0; k < 4; k++) this.fx.burst(lamp.x, 1.8, lamp.z, 40, k % 2 ? 0xffe0a0 : 0xffffff, 5, 1.8, 0.3);
    for (const h of room.hollows) if (h.state === 'alive') h.kill();
  }
  revealB() {
    const s = this.shade;
    this.audio.play('memory');
    this.ui.flash(0.7);
    const p2 = makeCharacter('person2');
    p2.position.copy(s.mesh.position);
    p2.rotation.y = s.face;
    p2.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material.transparent = true; o.material.opacity = 0; } });
    this.room.group.add(p2);
    this.p2 = p2;
    this.p2Fade = 0;
    this.fx.burst(s.pos.x, 0.8, s.pos.y, 60, 0xff9fc8, 3, 1.6, 0.3);
    $('#p2name').textContent = this.ui.names.B;
  }
  mothToB() {
    const s = this.shade;
    this.moth.target = new THREE.Vector3(s.pos.x, 1.2, s.pos.y);
    setTimeout(() => {
      this.fx.burst(s.pos.x, 1.2, s.pos.y, 40, 0xfff0b0, 2.5, 1.4, 0.25);
      this.moth.visible = false;
      this.audio.play('latch');
    }, this.ui.auto ? 5 : 1400);
  }
  async playHospital() {
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
    const S = this.S, H = this.hospital;
    await this.ui.fade(0, 2500, true);
    await S.say('narr', '— 백 일째 아침 —');
    await S.wait(0.8);
    await S.say('B', '……{A:아}?');
    H.eyeOpen = 0.35;
    await S.wait(0.9);
    H.eyeOpen = 1;
    await S.say('B', '{A:아}!');
    await S.say('A', '……오늘, 날씨 좋다.');
    await S.say('B', '……응. 진짜 좋아.');
    H.camKTarget = 1;
    await S.wait(2.6);
    await S.say('narr', '빛이 있는 곳엔, 언제나 그림자가 있다.');
    await S.wait(1.2);
    this.showEndCard();
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
  resize() {
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
    // 방 밖의 허공이 너무 많이 보이지 않도록 카메라 중심을 방 안쪽으로 당겨요
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
    if (!lt || this.frozen) {
      if (lt) this.moon.intensity = damp(this.moon.intensity, 0.35, 4, dt);
      return;
    }
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
        this.audio.play('thunder');
        this.shake(0.3);
        this.moon.intensity = 6;
        const s = this.shade;
        if (s.alive && s.dashT <= 0 && s.invuln <= 0 && this.lightningExposed(s.pos.x, s.pos.y)) {
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

  updateHUD(dt) {
    const s = this.shade;
    const hp = $('#hpFill');
    hp.style.width = (Math.max(0, s.hp) * 100).toFixed(1) + '%';
    hp.classList.toggle('low', s.hp < 0.35);
    const burn = $('#burnR');
    const burning = this.state === 'play' && s.alive && !this.frozen && (s.lit || s.far) && s.dashT <= 0 && s.invuln <= 0;
    burn.style.opacity = burning ? (0.5 + (1 - s.hp) * 0.5).toFixed(2) : '0';
    burn.classList.toggle('far', !s.lit && s.far);
    const cd = $('#btnP2A');
    cd.style.setProperty('--cd', ((s.cd / CFG.DASH_CD) * 100).toFixed(0) + '%');
    this.audio.setLoop('burn', burning && s.lit ? 0.12 : 0, 0.05);
    if (this.tutOn) {
      if (this.input.moved[0]) $('#tutL').classList.add('hidden');
      if (this.input.moved[1]) $('#tutR').classList.add('hidden');
      if (this.input.moved[0] && this.input.moved[1]) this.tutOn = false;
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
    if (this.room && dt > 0) {
      if (this.frozen) this.input.flush();
      this.bearer.update(dt);
      this.shade.update(dt);
      this.room.update(dt);
      this.moth.update(dt);
      this.updateLightning(dt);
      if (this.shadeFadeTarget !== undefined) this.shade.fade = damp(this.shade.fade, this.shadeFadeTarget, 1.2, dt);
      if (this.p2) {
        this.p2Fade = Math.min(1, this.p2Fade + dt * 0.5);
        this.p2.traverse((o) => { if (o.isMesh) o.material.opacity = this.p2Fade; });
        this.shade.fade = Math.max(0, 1 - this.p2Fade * 1.2);
      }
    }
    // 등불 빛 적용
    const li = this.bearer.light;
    const t = this.time;
    const flick = 1 + Math.sin(t * 13.7) * 0.03 + Math.sin(t * 7.1) * 0.03;
    this.lamp.position.set(li.x, li.y, li.z);
    this.lamp.distance = li.R + 1.5;
    this.lamp.shadow.camera.far = li.R + 2;
    const baseI = this.bearer.lantern.held ? (this.bearer.lantern.mode === 'high' ? 11 : 8.5) : this.bearer.lantern.placed?.kind === 'pedestal' ? 14 : 6.5;
    this.lamp.intensity = baseI * flick;
    U.uL1.value.set(li.x, li.y, li.z, li.R);
    const beam = this.room?.beam;
    if (this.bigLight) {
      this.lampLit = Math.min(1, (this.lampLit || 0) + dt * 0.4);
      this.bigLight.intensity = this.lampLit * 40;
      this.room.lamp.lit = this.lampLit;
      U.uL2.value.set(this.room.lamp.x, 2, this.room.lamp.z, 4 + this.lampLit * 30);
      this.hemi.intensity = damp(this.hemi.intensity, 1.4, 1, dt);
    } else if (beam) U.uL2.value.set(beam.x, beam.light.y, beam.z, beam.R);
    else U.uL2.value.set(0, 0, 0, 0);
    if (this.room && li.R > 0) this.fx.dust(dt, li.x, li.y, li.z, li.R, 0xffd9a0);
    this.updateCamera(dt || 0.016);
    this.fx.updateRain(dt, this.cam.x, this.cam.z);
    this.fx.update(dt);
    this.updateHUD(dt);
    // 타이틀 화면에서는 캐릭터가 천천히 걸어요
    if (this.state === 'title' && this.room) this.titleIdle(dt);
    this.renderer.render(this.scene, this.camera);
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
