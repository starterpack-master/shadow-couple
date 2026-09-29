import * as THREE from 'three';
import { CFG, rng } from './config.js';
import { lambert, tex, PAL, hexShift, makeGlow, glowTex } from './materials.js';
import { makePillar, makeBlock } from './models.js';
import {
  Crate, Door, MoonPlate, WeightPlate, Flower, Memory, Exit, Rotor, Mover, Hollow, Pedestal, Beam, GreatLamp,
} from './entities.js';

// 타일 종류
const K = { VOID: 0, FLOOR: 1, WALL: 2, HOLE: 3, BARS: 4, PILLAR: 5, BLOCK: 6, PED: 7, ROTOR: 8, TOWER: 9, LAMP: 10, FLOWER: 11 };
const BASE = { '#': K.WALL, ' ': K.VOID, o: K.HOLE, '|': K.BARS, p: K.PILLAR, b: K.BLOCK, P: K.PED, r: K.ROTOR, X: K.TOWER, G: K.LAMP, g: K.LAMP };

export class Room {
  constructor(g, def) {
    this.g = g;
    this.def = def;
    this.ch = def.ch;
    this.pal = PAL[def.ch] || PAL[1];
    this.group = new THREE.Group();
    g.scene.add(this.group);
    this.crates = []; this.doors = []; this.triggers = []; this.rotors = []; this.movers = []; this.hollows = [];
    this.pedestals = []; this.flowers = []; this.memory = null; this.beam = null; this.lamp = null; this.exit = null;
    this.groupState = {};
    this.parse();
    this.buildGeometry();
    this.buildEntities();
    this.buildDecor();
    this.buildBackdrop();
  }

  // ---------------------------------------------------------------- parsing
  parse() {
    const rows = this.def.map;
    this.H = rows.length;
    this.W = Math.max(...rows.map((r) => r.length));
    this.chars = rows.map((r) => r.padEnd(this.W, ' ').split(''));
    this.kind = [];
    this.filled = [];
    const legend = this.def.legend || {};
    for (let z = 0; z < this.H; z++) {
      this.kind.push([]); this.filled.push([]);
      for (let x = 0; x < this.W; x++) {
        const c = this.chars[z][x];
        let k = BASE[c];
        if (k === undefined) k = legend[c]?.t === 'flower' ? K.FLOWER : K.FLOOR;
        this.kind[z].push(k);
        this.filled[z].push(false);
      }
    }
  }
  k(x, z) {
    if (x < 0 || z < 0 || x >= this.W || z >= this.H) return K.VOID;
    return this.kind[z][x];
  }
  charAt(x, z) {
    if (x < 0 || z < 0 || x >= this.W || z >= this.H) return ' ';
    return this.chars[z][x];
  }
  isWallish(x, z) {
    const k = this.k(x, z);
    return k === K.WALL || k === K.BARS;
  }
  isHole(x, z) { return this.k(x, z) === K.HOLE && !this.filled[z][x]; }
  fillHole(x, z) { if (this.k(x, z) === K.HOLE) this.filled[z][x] = true; }
  crateAt(x, z) {
    for (const c of this.crates) if (c.state !== 'filled' && c.state !== 'fall' && c.tx === x && c.tz === z) return c;
    return null;
  }
  doorAt(x, z) {
    for (const d of this.doors) if (d.tx === x && d.tz === z) return d;
    return null;
  }
  solidFor(x, z, who) {
    const k = this.k(x, z);
    switch (k) {
      case K.FLOOR: break;
      case K.BARS: if (who === 'bearer' || who === 'crate') return true; break;
      case K.HOLE: if (!this.filled[z][x]) return true; break;
      default: return true;
    }
    const d = this.doorAt(x, z);
    if (d && d.solid) return true;
    if (this.crateAt(x, z)) return true;
    return false;
  }
  crateCanEnter(x, z) {
    const k = this.k(x, z);
    if (k === K.HOLE) return this.filled[z][x];
    if (k !== K.FLOOR) return false;
    if (this.crateAt(x, z)) return false;
    const d = this.doorAt(x, z);
    if (d && d.solid) return false;
    const b = this.g.bearer;
    if (Math.floor(b.pos.x) === x && Math.floor(b.pos.y) === z) return false;
    if (this.memory && !this.memory.taken && Math.floor(this.memory.x) === x && Math.floor(this.memory.z) === z) return false;
    return true;
  }
  tileOccupied(x, z) {
    const g = this.g, R = CFG.RADIUS;
    const inTile = (px, pz) => px + R > x && px - R < x + 1 && pz + R > z && pz - R < z + 1;
    if (inTile(g.bearer.pos.x, g.bearer.pos.y)) return true;
    if (g.shade.alive && inTile(g.shade.pos.x, g.shade.pos.y)) return true;
    for (const c of this.crates) if (c.state !== 'filled' && c.tx === x && c.tz === z) return true;
    return false;
  }

  // ---------------------------------------------------------------- geometry
  buildGeometry() {
    const W = this.W, H = this.H, pal = this.pal;
    const R = rng(this.def.id.charCodeAt(0) * 31 + this.def.id.charCodeAt(2) * 7);
    const floor = new GeoBuilder(), cliff = new GeoBuilder(), wallS = new GeoBuilder(), wallT = new GeoBuilder(), holeB = new GeoBuilder();
    const WH = CFG.WALL_H, CL = CFG.CLIFF;
    const isW = (x, z) => this.k(x, z) === K.WALL;
    const isOpen = (x, z) => { const k = this.k(x, z); return k === K.VOID || k === K.HOLE; };

    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        const k = this.k(x, z);
        if (k === K.VOID) continue;
        if (k === K.WALL) {
          const v = 0.9 + R() * 0.12;
          wallT.quad([x, WH, z + 1], [x + 1, WH, z + 1], [x + 1, WH, z], [x, WH, z], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [v, v, v, v]);
          const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (const [dx, dz] of sides) {
            if (isW(x + dx, z + dz)) continue;
            const y0 = isOpen(x + dx, z + dz) ? -CL : 0;
            const f = sideFace(x, z, dx, dz, y0, WH);
            const vb = y0 < 0 ? 0.35 : 0.6;
            wallS.quad(f[0], f[1], f[2], f[3], [dx, 0, dz], [[0, y0 / WH], [1, y0 / WH], [1, 1], [0, 1]], [vb * v, vb * v, v, v]);
          }
          continue;
        }
        if (k === K.HOLE) {
          holeB.quad([x, -1, z + 1], [x + 1, -1, z + 1], [x + 1, -1, z], [x, -1, z], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 1, 1, 1]);
          continue;
        }
        // 바닥 (모서리별 AO)
        const ao = (cx, cz) => {
          let n = 0;
          if (isW(cx - 1, cz - 1)) n++; if (isW(cx, cz - 1)) n++; if (isW(cx - 1, cz)) n++; if (isW(cx, cz)) n++;
          return 1 - n * 0.16;
        };
        const v = 0.93 + R() * 0.1;
        const rot = Math.floor(R() * 4);
        const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
        for (let i = 0; i < rot; i++) uv.push(uv.shift());
        floor.quad([x, 0, z + 1], [x + 1, 0, z + 1], [x + 1, 0, z], [x, 0, z], [0, 1, 0], uv,
          [ao(x, z + 1) * v, ao(x + 1, z + 1) * v, ao(x + 1, z) * v, ao(x, z) * v]);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!isOpen(x + dx, z + dz)) continue;
          const hole = this.k(x + dx, z + dz) === K.HOLE;
          const f = sideFace(x, z, dx, dz, hole ? -1 : -CL, 0);
          cliff.quad(f[0], f[1], f[2], f[3], [dx, 0, dz], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.35, 0.35, 1, 1]);
        }
      }
    }

    const floorMat = lambert({ map: tex(pal.floorTex, pal.floor, pal.floor2), vertexColors: true });
    const wallMat = lambert({ map: tex(pal.wallTex, pal.wall), vertexColors: true });
    const topMat = lambert({ color: pal.wallTop, vertexColors: true });
    const cliffMat = lambert({ color: pal.cliff, vertexColors: true });
    const holeMat = lambert({ color: hexShift(pal.cliff, -0.08), vertexColors: true });

    const add = (b, mat, cast, recv) => {
      if (!b.count) return null;
      const m = new THREE.Mesh(b.build(), mat);
      m.castShadow = cast; m.receiveShadow = recv;
      this.group.add(m);
      return m;
    };
    add(floor, floorMat, false, true);
    add(cliff, cliffMat, false, false);
    add(wallS, wallMat, true, true);
    add(wallT, topMat, true, true);
    add(holeB, holeMat, false, true);

    // 벽 그림자 판정용 박스 (가로로 이어진 벽은 하나로 합쳐요)
    const occ = this.g.occ;
    for (let z = 0; z < H; z++) {
      let x = 0;
      while (x < W) {
        if (!isW(x, z)) { x++; continue; }
        const s = x;
        while (x < W && isW(x, z)) x++;
        occ.box((s + x) / 2, WH / 2, z + 0.5, (x - s) / 2, WH / 2, 0.5, 0, 'wall');
      }
    }

    // 철창 (그림자는 통과, 빛도 통과)
    const bars = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (this.k(x, z) === K.BARS) bars.push([x, z]);
    if (bars.length) {
      const cyl = new THREE.CylinderGeometry(0.035, 0.035, 1.7, 6);
      const rail = new THREE.BoxGeometry(1, 0.06, 0.06);
      const barMat = lambert({ color: 0x2c2a36 });
      const im = new THREE.InstancedMesh(cyl, barMat, bars.length * 4);
      const ir = new THREE.InstancedMesh(rail, barMat, bars.length * 2);
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
      let bi = 0, ri = 0;
      for (const [x, z] of bars) {
        const alongX = this.isWallish(x - 1, z) || this.isWallish(x + 1, z) || !!this.doorAt(x - 1, z);
        for (let i = 0; i < 4; i++) {
          const o = 0.125 + i * 0.25;
          P.set(alongX ? x + o : x + 0.5, 0.85, alongX ? z + 0.5 : z + o);
          M.compose(P, Q, S); im.setMatrixAt(bi++, M);
        }
        const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), alongX ? 0 : Math.PI / 2);
        for (const y of [0.25, 1.62]) { P.set(x + 0.5, y, z + 0.5); M.compose(P, q2, S); ir.setMatrixAt(ri++, M); }
      }
      im.castShadow = false; ir.castShadow = false;
      this.group.add(im, ir);
    }
  }

  // ---------------------------------------------------------------- entities
  buildEntities() {
    const legend = this.def.legend || {};
    const occ = this.g.occ;
    const exitTiles = [];
    this.startA = [2.5, 2.5]; this.startS = [3.5, 3.5];
    for (let z = 0; z < this.H; z++) {
      for (let x = 0; x < this.W; x++) {
        const c = this.chars[z][x];
        const cx = x + 0.5, cz = z + 0.5;
        const L = legend[c];
        if (L) {
          if (L.t === 'door') this.doors.push(new Door(this, x, z, L));
          else if (L.t === 'moon') this.triggers.push(new MoonPlate(this, x, z, L));
          else if (L.t === 'weight') this.triggers.push(new WeightPlate(this, x, z, L));
          else if (L.t === 'flower') { const f = new Flower(this, x, z, L); this.triggers.push(f); this.flowers.push(f); }
          continue;
        }
        switch (c) {
          case 'L': this.startA = [cx, cz]; break;
          case 'S': this.startS = [cx, cz]; break;
          case 'c': this.crates.push(new Crate(this, x, z)); break;
          case 'E': exitTiles.push([x, z]); break;
          case 'm': this.memory = new Memory(this, x, z, this.def.memory, !!this.def.memorySpawn); break;
          case 'h': this.hollows.push(new Hollow(this, x, z)); break;
          case 'P': this.pedestals.push(new Pedestal(this, x, z)); break;
          case 'r': this.rotors.push(new Rotor(this, x, z, this.def.rotor || {})); break;
          case 'X': this.beam = new Beam(this, x, z, this.def.beam || {}); break;
          case 'G': this.lamp = new GreatLamp(this, x, z); break;
          case 'p': {
            const m = makePillar(this.ch, this.pal); m.position.set(cx, 0, cz); this.group.add(m);
            occ.box(cx, CFG.PILLAR_H / 2, cz, CFG.PILLAR_R, CFG.PILLAR_H / 2, CFG.PILLAR_R, 0, 'pillar');
            break;
          }
          case 'b': {
            const m = makeBlock(this.ch, this.pal); m.position.set(cx, 0, cz); this.group.add(m);
            occ.box(cx, CFG.BLOCK_H / 2, cz, 0.45, CFG.BLOCK_H / 2, 0.45, 0, 'block');
            break;
          }
          default: break;
        }
      }
    }
    for (const mv of this.def.movers || []) this.movers.push(new Mover(this, mv));
    if (exitTiles.length) this.exit = new Exit(this, exitTiles);
  }

  // ---------------------------------------------------------------- logic
  groupActive(name) {
    return !!this.groupState[name];
  }
  computeGroups() {
    const names = new Set();
    for (const t of this.triggers) names.add(t.gname);
    for (const n of Object.keys(this.def.groups || {})) names.add(n);
    for (const n of names) {
      let ok = true, any = false;
      for (const t of this.triggers) if (t.gname === n) { any = true; if (!t.active) ok = false; }
      const conds = (this.def.groups || {})[n] || [];
      for (const c of conds) { any = true; if (!this.cond(c)) ok = false; }
      this.groupState[n] = any && ok;
    }
  }
  cond(c) {
    if (c === 'hollows') return this.hollows.every((h) => h.state !== 'alive');
    if (c === 'memory') return !this.memory || this.memory.taken;
    return false;
  }
  exitReady() {
    if (this.memory && !this.memory.taken) return false;
    for (const c of this.def.exitNeeds || []) if (!this.cond(c)) return false;
    return true;
  }
  // 움직이는 지형(회전목마/범퍼카/탐조등): 양쪽 폰 모두에서 돌아요
  animate(dt) {
    for (const r of this.rotors) r.update(dt);
    for (const m of this.movers) m.update(dt);
    if (this.beam) this.beam.update(dt);
  }
  // 판정: 방장(또는 한 폰 모드)에서만
  logic(dt) {
    const g = this.g;
    for (const c of this.crates) c.logic(dt);
    for (const t of this.triggers) t.logic(dt);
    this.computeGroups();
    for (const d of this.doors) d.logic(dt);
    for (const h of this.hollows) h.logic(dt);
    if (this.lamp) this.lamp.ready = !!(this.memory && this.memory.taken) && this.cond('hollows');
    if (this.memory) {
      if (this.memory.hidden && this.def.memorySpawn && this.cond(this.def.memorySpawn) && !g.frozen) {
        this.memory.reveal();
        g.onMemoryReveal?.();
      }
      this.memory.logic(dt);
    }
    if (this.exit) this.exit.logic(dt);
  }
  // 표현: 양쪽 폰 모두에서
  visual(dt) {
    const g = this.g;
    for (const c of this.crates) c.visual(dt);
    for (const t of this.triggers) t.visual(dt);
    for (const d of this.doors) d.visual(dt);
    for (const h of this.hollows) h.visual(dt);
    for (const p of this.pedestals) p.visual(dt);
    if (this.lamp) this.lamp.visual(dt);
    if (this.memory) this.memory.visual(dt);
    if (this.exit) this.exit.visual(dt);
    if (this.decor) this.decor(dt, g.time);
    if (this.backdropUpdate) this.backdropUpdate(dt, g.time);
  }
  netState() {
    return {
      c: this.crates.map((c) => c.net()), d: this.doors.map((d) => d.net()), t: this.triggers.map((t) => t.net()),
      h: this.hollows.map((h) => h.net()), r: this.rotors.map((r) => r.net()), m: this.movers.map((m) => m.net()),
      p: this.pedestals.map((p) => p.net()), b: this.beam ? this.beam.net() : 0, l: this.lamp ? this.lamp.net() : 0,
      mem: this.memory ? this.memory.net() : 0,
    };
  }
  applyNet(s) {
    const each = (arr, data) => { if (data) for (let i = 0; i < arr.length && i < data.length; i++) arr[i].setNet(data[i]); };
    each(this.crates, s.c); each(this.doors, s.d); each(this.triggers, s.t); each(this.hollows, s.h);
    each(this.rotors, s.r); each(this.movers, s.m); each(this.pedestals, s.p);
    if (this.beam && s.b) this.beam.setNet(s.b);
    if (this.lamp && s.l) this.lamp.setNet(s.l);
    if (this.memory && s.mem) this.memory.setNet(s.mem);
  }

  // ---------------------------------------------------------------- decor (분위기 소품: 판정에는 영향 없음)
  buildDecor() {
    const ch = this.ch, W = this.W, H = this.H;
    const R = rng(ch * 131 + W * 7 + H);
    const floorTiles = [], wallTops = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const k = this.k(x, z), c = this.chars[z][x];
      if (k === K.FLOOR && c === '.') floorTiles.push([x, z]);
      if (k === K.WALL) wallTops.push([x, z]);
    }
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
    // 1) 바닥 장식 (낙엽/색종이/크레용 조각/물웅덩이/조개)
    const decal = { 1: ['#8d8a86', '#6f6c68', 'leaf'], 2: ['#ff8fb8', '#8fd0ff', 'confetti'], 3: ['#e0584f', '#4f8fe0', 'crumb'], 4: ['#233049', '#2c3a58', 'puddle'], 5: ['#f4e3d0', '#e8b8a8', 'shell'] }[ch];
    if (decal && floorTiles.length) {
      const tex2 = decalTex(decal[2], decal[0], decal[1]);
      const n = Math.min(90, Math.floor(floorTiles.length * (ch === 4 ? 0.1 : 0.22)));
      const mat = lambert({ map: tex2, transparent: true, depthWrite: false, alphaTest: 0.02 });
      if (ch === 4) { mat.opacity = 0.85; }
      const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
      const im = new THREE.InstancedMesh(geo, mat, n);
      for (let i = 0; i < n; i++) {
        const [x, z] = floorTiles[Math.floor(R() * floorTiles.length)];
        const sz = ch === 4 ? 0.9 + R() * 0.8 : 0.35 + R() * 0.35;
        P.set(x + 0.2 + R() * 0.6, 0.012 + i * 0.00005, z + 0.2 + R() * 0.6);
        Q.setFromEuler(E.set(0, R() * Math.PI * 2, 0)); S.set(sz, 1, sz * (ch === 4 ? 0.6 : 1));
        M4.compose(P, Q, S); im.setMatrixAt(i, M4);
      }
      im.receiveShadow = true; im.renderOrder = 1;
      this.group.add(im);
      if (ch === 4) { this.puddles = mat; }
    }
    // 2) 벽 위 소품
    if (wallTops.length) {
      const pick = (frac, max) => { const out = []; for (const t of wallTops) if (R() < frac) out.push(t); return out.slice(0, max); };
      if (ch === 1 || ch === 4) {
        // 굴뚝/안테나 + (4장) 깜빡이는 빨간 불빛
        const tops = pick(0.08, 26);
        const geo = new THREE.BoxGeometry(0.28, 0.5, 0.28);
        const im = new THREE.InstancedMesh(geo, lambert({ color: ch === 4 ? 0x2a3040 : 0x5a5a66 }), tops.length);
        tops.forEach(([x, z], i) => { P.set(x + 0.5, CFG.WALL_H + 0.25, z + 0.5); Q.identity(); S.set(1, 0.6 + R(), 1); M4.compose(P, Q, S); im.setMatrixAt(i, M4); });
        im.castShadow = false; this.group.add(im);
        if (ch === 4) {
          const pts = tops.map(([x, z]) => [x + 0.5, CFG.WALL_H + 0.9, z + 0.5]);
          this.blinkers = glowPoints(this.group, pts, 0xff4050, 0.22);
        }
      }
      if (ch === 2 || ch === 5) {
        // 벽 위를 따라 이어진 전구 줄
        const pts = [];
        for (const [x, z] of wallTops) {
          const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.k(x + dx, z + dz) !== K.WALL);
          if (edge && (x + z) % 2 === 0) pts.push([x + 0.5, CFG.WALL_H + 0.12, z + 0.5]);
        }
        this.bulbs = glowPoints(this.group, pts.slice(0, 160), ch === 2 ? 0xffd9a0 : 0xffc890, 0.3);
      }
      if (ch === 3) {
        // 책장 위 연필/지우개
        const tops = pick(0.1, 30);
        const cols = [0xe0584f, 0x4f8fe0, 0xf2c14e, 0x5cb85c, 0xffffff];
        const geo = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6); geo.rotateZ(Math.PI / 2);
        const im = new THREE.InstancedMesh(geo, lambert({ color: 0xffffff }), tops.length);
        tops.forEach(([x, z], i) => { P.set(x + 0.5, CFG.WALL_H + 0.06, z + 0.5); Q.setFromEuler(E.set(0, R() * 3, 0)); S.set(1, 1, 1); M4.compose(P, Q, S); im.setMatrixAt(i, M4); im.setColorAt(i, new THREE.Color(cols[i % cols.length])); });
        im.castShadow = false; this.group.add(im);
      }
      if (ch === 1 || ch === 5) {
        // 벽 틈의 풀
        const tufts = [];
        for (const [x, z] of floorTiles) {
          if (R() > 0.12) continue;
          if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.k(x + dx, z + dz) === K.WALL)) continue;
          tufts.push([x, z]);
        }
        const geo = new THREE.ConeGeometry(0.05, 0.28, 4); geo.translate(0, 0.14, 0);
        const n = Math.min(tufts.length * 5, 220);
        const im = new THREE.InstancedMesh(geo, lambert({ color: ch === 1 ? 0x6a7a62 : 0x8aa070 }), n);
        let i = 0;
        for (const [x, z] of tufts) for (let k = 0; k < 5 && i < n; k++, i++) {
          P.set(x + 0.15 + R() * 0.7, 0, z + 0.15 + R() * 0.7);
          Q.setFromEuler(E.set((R() - 0.5) * 0.6, R() * 3, (R() - 0.5) * 0.6)); S.set(1, 0.6 + R() * 0.8, 1);
          M4.compose(P, Q, S); im.setMatrixAt(i, M4);
        }
        im.count = i; im.castShadow = false; im.receiveShadow = true;
        this.group.add(im);
      }
    }
    this.decor = (dt, t) => {
      if (this.blinkers) this.blinkers.material.opacity = 0.35 + 0.65 * (Math.sin(t * 3) > 0.6 ? 1 : 0.15);
      if (this.bulbs) this.bulbs.material.opacity = 0.75 + Math.sin(t * 2.3) * 0.15;
      if (this.puddles) this.puddles.opacity = 0.75 + Math.sin(t * 1.7) * 0.1;
    };
  }

  // ---------------------------------------------------------------- backdrop
  buildBackdrop() {
    const ch = this.ch, W = this.W, H = this.H, pal = this.pal;
    const R = rng(ch * 97 + W);
    const grp = new THREE.Group();
    this.group.add(grp);
    const cx = W / 2, cz = H / 2;
    const fogCol = new THREE.Color(pal.fog);
    const dark = (hex, k = 0.55) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(0.5).lerp(fogCol.clone().multiplyScalar(0.55), Math.min(0.8, k + 0.2)), fog: false });

    if (ch === 1 || ch === 4 || ch === 0) {
      // 도시 실루엣
      const bm = dark(ch === 4 ? '#141a28' : '#1b1d27', 0.18);
      const winM = new THREE.MeshBasicMaterial({ color: ch === 4 ? 0xffd7a0 : 0xffc680, transparent: true, opacity: ch === 4 ? 0.7 : 0.35, fog: false });
      for (let i = 0; i < 46; i++) {
        const a = Math.PI * 1.08 + R() * Math.PI * 0.84, d = Math.max(W, H) * 0.65 + 10 + R() * 16;
        const x = cx + Math.cos(a) * d * 1.1, z = cz + Math.sin(a) * d * 0.8; // 방 뒤쪽(북쪽)과 양옆에만
        const w = 2 + R() * 3, h = 3 + R() * 12, dd = 2 + R() * 3;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h + 10, dd), bm);
        b.position.set(x, h / 2 - 8, z); grp.add(b);
        for (let k = 0; k < 4; k++) {
          if (R() < 0.45) continue;
          const wm = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), winM);
          wm.position.set(x + (R() - 0.5) * (w - 0.8), h - 8 + 3 + R() * 6, z + dd / 2 + 0.01);
          grp.add(wm);
        }
      }
    } else if (ch === 2) {
      // 대관람차 + 천막
      const wheel = new THREE.Group();
      const wm = dark('#6a4a8a', 0.3);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 0.18, 6, 48), wm); wheel.add(ring);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(8.6, 0.08, 6, 48), wm); wheel.add(ring2);
      const lights = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 9, 4), wm);
        sp.position.set(Math.cos(a) * 4.5, Math.sin(a) * 4.5, 0); sp.rotation.z = a - Math.PI / 2; wheel.add(sp);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.9), dark(['#ff8fb0', '#8fd0ff', '#ffe08f'][i % 3], 0.35));
        cab.position.set(Math.cos(a) * 9, Math.sin(a) * 9 - 0.6, 0); wheel.add(cab); lights.push(cab);
        const gl = makeGlow(0xffd0a0, 1.2, 0.6); gl.position.set(Math.cos(a) * 9, Math.sin(a) * 9, 0.3); wheel.add(gl);
      }
      wheel.position.set(cx + 4, 3, -14);
      grp.add(wheel);
      const legM = dark('#4a3a60', 0.3);
      for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 14, 5), legM); leg.position.set(cx + 4 + s * 3, -3, -14); leg.rotation.z = s * 0.22; grp.add(leg); }
      for (let i = 0; i < 8; i++) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(2 + R() * 1.5, 3 + R() * 2, 8), dark(['#c05a8a', '#5a8ac0', '#c0a05a'][i % 3], 0.4));
        const a = R() * Math.PI * 2, d = Math.max(W, H) * 0.6 + 5 + R() * 6;
        t.position.set(cx + Math.cos(a) * (d + 8), -2.5, cz - Math.abs(Math.sin(a)) * d * 0.7 - 6); grp.add(t);
      }
      this.backdropUpdate = (dt) => { wheel.rotation.z += dt * 0.05; for (const c of lights) c.rotation.z = -wheel.rotation.z; };
    } else if (ch === 3) {
      // 거대한 방: 아래 바닥 + 거대 소품
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), lambert({ color: 0x8a7a70, map: (() => { const t = tex('wood', '#3a2a1e').clone(); t.repeat.set(40, 40); t.needsUpdate = true; return t; })() }));
      fl.rotation.x = -Math.PI / 2; fl.position.set(cx, -CFG.CLIFF - 0.05, cz); fl.receiveShadow = false; grp.add(fl);
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(3, 2.8, 7, 24), dark('#e8d8c8', 0.35)); mug.position.set(cx - W * 0.5 - 14, 1, cz - 14); grp.add(mug);
      const mug2 = new THREE.Mesh(new THREE.CylinderGeometry(3, 2.8, 7, 24), dark('#f0c8d8', 0.35)); mug2.position.set(cx - W * 0.5 - 7, 1, cz - 20); grp.add(mug2);
      for (let i = 0; i < 5; i++) {
        const bk = new THREE.Mesh(new THREE.BoxGeometry(8, 1.6, 5.5), dark(['#a44a3f', '#3f6fa4', '#d9a441', '#5a8f5a', '#8a5aa4'][i], 0.4));
        bk.position.set(cx + W * 0.5 + 12, -1.3 + i * 1.6, cz - 10); bk.rotation.y = (R() - 0.5) * 0.4; grp.add(bk);
      }
      const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 18, 8), dark('#3a3030', 0.3)); lampPole.position.set(cx + 9, 7, -12); grp.add(lampPole);
      const shadeM = new THREE.Mesh(new THREE.ConeGeometry(4, 4, 16, 1, true), dark('#e8c89a', 0.25)); shadeM.position.set(cx + 9, 16, -12); grp.add(shadeM);
      const star = makeGlow(0xffe0b0, 6, 0.3); star.position.set(cx + 9, 14, -12); grp.add(star);
    } else if (ch === 5) {
      // 바다 + 노을 + 먼 등대
      const seaMat = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uA: { value: new THREE.Color('#27386e') }, uB: { value: new THREE.Color('#ffb08a') } },
        vertexShader: `uniform float uT; varying float vH; varying vec2 vP;
          void main(){ vec3 p = position; float h = sin(p.x*0.3 + uT*1.2)*0.25 + sin(p.y*0.45 - uT*0.9)*0.2; p.z += h; vH = h; vP = p.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
        fragmentShader: `uniform vec3 uA; uniform vec3 uB; varying float vH; varying vec2 vP;
          void main(){ float k = clamp(0.5 + vH*1.5, 0.0, 1.0); vec3 c = mix(uA, uB, k*0.28);
          float s = smoothstep(0.35, 0.45, vH); c += s*0.25; gl_FragColor = vec4(c, 1.0); }`,
      });
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(220, 220, 90, 90), seaMat);
      sea.rotation.x = -Math.PI / 2; sea.position.set(cx, this.def.final ? -9 : -2.6, cz); grp.add(sea);
      const sun = makeGlow(0xffb080, 26, 0.9); sun.position.set(cx - 10, 4, -50); grp.add(sun);
      const sun2 = makeGlow(0xfff0d0, 8, 1); sun2.position.set(cx - 10, 4, -49); grp.add(sun2);
      if (this.def.id !== '5-3') {
        const lh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2, 16, 16), dark('#f4efe6', 0.3)); body.position.y = 6; lh.add(body);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2, 16), dark('#d9463f', 0.3)); top.position.y = 15; lh.add(top);
        const gl = makeGlow(0xfff2c0, 5, 0.5); gl.position.y = 15.5; lh.add(gl);
        lh.position.set(cx + 14, -3, -26); grp.add(lh);
      }
      for (let i = 0; i < (this.def.final ? 0 : 14); i++) {
        const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + R() * 2.5, 0), dark('#1c1826', 0.05));
        const a = R() * Math.PI * 2, d = Math.max(W, H) * 0.55 + 3 + R() * 6;
        rk.position.set(cx + Math.cos(a) * d, -2.4, cz + Math.sin(a) * d * 0.8); rk.rotation.set(R() * 3, R() * 3, R() * 3); grp.add(rk);
      }
      this.backdropUpdate = (dt, t) => { seaMat.uniforms.uT.value = t; };
    }
  }

  dispose() {
    this.g.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) m.dispose();
      }
      if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose();
    });
  }
}

// 타일 한 면(옆면)의 네 꼭짓점: 바깥쪽에서 봤을 때 반시계 방향
function sideFace(x, z, dx, dz, y0, y1) {
  if (dx === 1) return [[x + 1, y0, z + 1], [x + 1, y0, z], [x + 1, y1, z], [x + 1, y1, z + 1]];
  if (dx === -1) return [[x, y0, z], [x, y0, z + 1], [x, y1, z + 1], [x, y1, z]];
  if (dz === 1) return [[x, y0, z + 1], [x + 1, y0, z + 1], [x + 1, y1, z + 1], [x, y1, z + 1]];
  return [[x + 1, y0, z], [x, y0, z], [x, y1, z], [x + 1, y1, z]];
}

class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; this.count = 0; }
  quad(a, b, c, d, n, uv, col) {
    // 감긴 방향이 법선과 맞는지 확인하고, 아니면 뒤집어요
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    let verts = [a, b, c, d], uvs = uv, cols = col;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { verts = [a, d, c, b]; uvs = [uv[0], uv[3], uv[2], uv[1]]; cols = [col[0], col[3], col[2], col[1]]; }
    const base = this.count;
    for (let k = 0; k < 4; k++) {
      this.p.push(...verts[k]); this.n.push(...n); this.uv.push(...uvs[k]);
      const v = cols[k]; this.c.push(v, v, v);
    }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count += 4;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

function glowPoints(group, pts, color, size) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  const m = new THREE.PointsMaterial({ color, size, map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const p = new THREE.Points(g, m);
  group.add(p);
  return p;
}

const decalCache = new Map();
function decalTex(kind, a, b) {
  const key = kind + a + b;
  if (decalCache.has(key)) return decalCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32);
  if (kind === 'leaf') {
    for (let i = 0; i < 2; i++) {
      g.save(); g.rotate(i * 1.9); g.fillStyle = i ? b : a;
      g.beginPath(); g.ellipse(6 * i, 0, 16, 7, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-14 + 6 * i, 0); g.lineTo(14 + 6 * i, 0); g.stroke(); g.restore();
    }
  } else if (kind === 'confetti') {
    const cols = ['#ff8fb8', '#8fd0ff', '#ffe08f', '#b49bff', '#9dff8a'];
    for (let i = 0; i < 7; i++) { g.save(); g.rotate(i * 0.9); g.fillStyle = cols[i % cols.length]; g.fillRect(-4 + (i % 3) * 8, -14 + i * 4, 7, 4); g.restore(); }
  } else if (kind === 'crumb') {
    const cols = [a, b, '#f2c14e', '#5cb85c'];
    for (let i = 0; i < 3; i++) { g.save(); g.rotate(i * 2.1); g.fillStyle = cols[i]; g.fillRect(-12, -3 + i * 6, 18, 5); g.restore(); }
  } else if (kind === 'puddle') {
    const gr = g.createRadialGradient(0, 0, 4, 0, 0, 30);
    gr.addColorStop(0, 'rgba(150,180,240,0.55)'); gr.addColorStop(0.7, 'rgba(60,80,130,0.5)'); gr.addColorStop(1, 'rgba(40,50,80,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 30, 24, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(200,220,255,0.25)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(-4, -3, 14, 9, 0.3, 0, Math.PI * 2); g.stroke();
  } else if (kind === 'shell') {
    g.fillStyle = a; g.beginPath(); g.moveTo(0, -12); g.quadraticCurveTo(15, -8, 12, 8); g.lineTo(-12, 8); g.quadraticCurveTo(-15, -8, 0, -12); g.fill();
    g.strokeStyle = b; g.lineWidth = 1.5; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(0, -10); g.lineTo(i * 5, 8); g.stroke(); }
    g.fillStyle = '#ffb07a'; g.save(); g.translate(14, 14); for (let i = 0; i < 5; i++) { g.rotate((Math.PI * 2) / 5); g.fillRect(-1.5, 0, 3, 8); } g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  decalCache.set(key, t);
  return t;
}

export { K };
