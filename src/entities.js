import * as THREE from 'three';
import { CFG, clamp, damp, dampAngle, smooth } from './config.js';
import { setYaw } from './shadow.js';
import { lambert, makeGlow } from './materials.js';
import {
  makeCharacter, makeLantern, makeMoth, makeCrate, makeDoor, makePlate, makeFlower, makeMemory,
  makeExitTile, makeRotor, makeCar, makeHollow, makeTower, makeGreatLamp, makePedestal, groupColor,
} from './models.js';

const ZERO_INPUT = { ax: 0, az: 0, mag: 0, aPressed: false, bPressed: false, aHeld: false, bHeld: false };

// ---------------------------------------------------------------------------
// 원형 캐릭터 vs 타일 충돌
// ---------------------------------------------------------------------------
export function moveCircle(room, pos, dx, dz, r, who) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.18));
  for (let s = 0; s < steps; s++) {
    pos.x += dx / steps;
    pos.y += dz / steps; // Vector2: y == world z
    resolve(room, pos, r, who);
  }
}
function resolve(room, pos, r, who) {
  for (let it = 0; it < 3; it++) {
    let moved = false;
    const x0 = Math.floor(pos.x - r), x1 = Math.floor(pos.x + r);
    const z0 = Math.floor(pos.y - r), z1 = Math.floor(pos.y + r);
    for (let tz = z0; tz <= z1; tz++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!room.solidFor(tx, tz, who)) continue;
        const cx = clamp(pos.x, tx, tx + 1), cz = clamp(pos.y, tz, tz + 1);
        const ddx = pos.x - cx, ddz = pos.y - cz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2), push = r - d;
          pos.x += (ddx / d) * push; pos.y += (ddz / d) * push;
        } else {
          const l = pos.x - tx, rr = tx + 1 - pos.x, t = pos.y - tz, b = tz + 1 - pos.y;
          const m = Math.min(l, rr, t, b);
          if (m === l) pos.x = tx - r; else if (m === rr) pos.x = tx + 1 + r; else if (m === t) pos.y = tz - r; else pos.y = tz + 1 + r;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function animWalk(mesh, speed, t, dt, squash = 1) {
  const u = mesh.userData;
  const k = clamp(speed / 3.5, 0, 1);
  const bob = Math.abs(Math.sin(t * 11)) * 0.07 * k;
  u.inner.position.y = bob;
  u.inner.rotation.z = Math.sin(t * 11) * 0.06 * k;
  u.inner.rotation.x = damp(u.inner.rotation.x, k * 0.12, 10, dt);
  const sq = 1 + (squash - 1);
  u.inner.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  u.tailPivot.rotation.x = damp(u.tailPivot.rotation.x, -0.25 - k * 0.9 + Math.sin(t * 7) * 0.12, 8, dt);
}

// ---------------------------------------------------------------------------
// 1P: 등불을 든 사람
// ---------------------------------------------------------------------------
export class Bearer {
  constructor(g) {
    this.g = g;
    this.mesh = makeCharacter('bearer');
    g.scene.add(this.mesh);
    this.lanternMesh = makeLantern();
    g.scene.add(this.lanternMesh);
    this.arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 1, 6), lambert({ color: 0xf1e4cc }));
    this.arm.castShadow = false;
    g.scene.add(this.arm);
    this.pos = new THREE.Vector2();
    this.vx = 0; this.vz = 0; this.face = 0; this.faceT = 0;
    this.t = 0; this.stepT = 0; this.pushT = 0;
    this.lantern = { held: true, mode: 'low', y: CFG.L.low.y, fwd: CFG.L.low.fwd, R: CFG.L.low.R, placed: null };
    this.light = { type: 'point', x: 0, y: 1, z: 0, R: 7, on: true, warm: true };
    this.squash = 1;
  }
  attach(occ) {
    this.occ = occ.box(0, CFG.BODY_H / 2, 0, 0.26, CFG.BODY_H / 2, 0.2, 0, 'body');
  }
  reset(x, z, face = 0) {
    this.pos.set(x, z); this.vx = this.vz = 0; this.face = this.faceT = face;
    const L = this.lantern;
    L.held = true; L.placed = null; L.mode = 'low'; L.y = CFG.L.low.y; L.fwd = CFG.L.low.fwd; L.R = CFG.L.low.R;
    this.updateLight(0, true);
    this.syncMesh(0);
  }
  update(dt) {
    const g = this.g, room = g.room;
    const inp = g.frozen ? ZERO_INPUT : g.input.p[0];
    this.t += dt;
    const sp = CFG.BEARER_SPEED;
    const tx = inp.ax * sp, tz = inp.az * sp;
    const k = inp.mag > 0.05 ? 13 : 16;
    this.vx = damp(this.vx, tx, k, dt);
    this.vz = damp(this.vz, tz, k, dt);
    const ox = this.pos.x, oz = this.pos.y;
    moveCircle(room, this.pos, this.vx * dt, this.vz * dt, CFG.RADIUS, 'bearer');
    const rvx = (this.pos.x - ox) / Math.max(dt, 1e-4), rvz = (this.pos.y - oz) / Math.max(dt, 1e-4);
    this.speed = Math.hypot(rvx, rvz);
    if (inp.mag > 0.2) this.faceT = Math.atan2(inp.ax, inp.az);
    this.face = dampAngle(this.face, this.faceT, 15, dt);

    this.handlePush(dt, inp);

    if (!g.frozen) {
      if (inp.aPressed && g.abil.height) this.toggleHeight();
      if (inp.bPressed) this.useB();
    }
    if (this.speed > 0.8) {
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = 0.32; g.audio.play('step'); }
    }
    this.squash = damp(this.squash, 1, 10, dt);
    this.updateLight(dt);
    this.syncMesh(dt);
  }
  toggleHeight() {
    const L = this.lantern;
    if (!L.held) return;
    L.mode = L.mode === 'low' ? 'high' : 'low';
    this.g.audio.play(L.mode === 'high' ? 'lampUp' : 'lampDown');
    this.squash = L.mode === 'high' ? 1.12 : 0.9;
    this.g.onLampMode?.();
  }
  useB() {
    const g = this.g, room = g.room, L = this.lantern;
    // 마지막 방: 거대한 등대에 등불 놓기
    const lamp = room.lamp;
    if (lamp && L.held && lamp.ready && Math.hypot(this.pos.x - lamp.x, this.pos.y - lamp.z) < 2.6) {
      g.onGreatLamp();
      return;
    }
    if (!g.abil.place) return;
    if (L.held) {
      const ped = room.pedestals.find((p) => !p.has && Math.hypot(p.x - this.pos.x, p.z - this.pos.y) < 1.45);
      if (ped) {
        ped.has = true;
        L.placed = { kind: 'pedestal', x: ped.x, z: ped.z, y: CFG.L.pedestal.y, R: CFG.L.pedestal.R, ped };
      } else {
        let px = this.pos.x + Math.sin(this.face) * 0.55, pz = this.pos.y + Math.cos(this.face) * 0.55;
        if (room.solidFor(Math.floor(px), Math.floor(pz), 'shade')) { px = this.pos.x; pz = this.pos.y; }
        L.placed = { kind: 'ground', x: px, z: pz, y: CFG.L.ground.y, R: CFG.L.ground.R };
      }
      L.held = false;
      g.audio.play('place');
      g.fx.burst(L.placed.x, L.placed.y, L.placed.z, 14, 0xffc470, 1.5, 0.7, 0.2);
      g.onLampMode?.();
    } else {
      const P = L.placed;
      const d = Math.hypot(P.x - this.pos.x, P.z - this.pos.y);
      if (d < (P.kind === 'pedestal' ? 1.6 : 1.3)) {
        if (P.ped) P.ped.has = false;
        L.held = true; L.placed = null;
        g.audio.play('pick');
        g.onLampMode?.();
      } else {
        g.toast('등불이 너무 멀어요. 가까이 가서 다시 눌러요');
      }
    }
  }
  handlePush(dt, inp) {
    const room = this.g.room;
    if (inp.mag < 0.5 || this.g.frozen) { this.pushT = 0; return; }
    let dx = 0, dz = 0;
    if (Math.abs(inp.ax) > Math.abs(inp.az) * 1.3) dx = Math.sign(inp.ax);
    else if (Math.abs(inp.az) > Math.abs(inp.ax) * 1.3) dz = Math.sign(inp.az);
    else { this.pushT = 0; return; }
    const tx = Math.floor(this.pos.x), tz = Math.floor(this.pos.y);
    const crate = room.crateAt(tx + dx, tz + dz);
    if (!crate || crate.state !== 'idle') { this.pushT = 0; return; }
    const edge = dx ? (dx > 0 ? tx + 1 - this.pos.x : this.pos.x - tx) : (dz > 0 ? tz + 1 - this.pos.y : this.pos.y - tz);
    if (edge > CFG.RADIUS + 0.08) { this.pushT = 0; return; }
    // 밀 때 줄을 맞춰주면 조작감이 좋아져요
    if (dx) this.pos.y = damp(this.pos.y, tz + 0.5, 8, dt); else this.pos.x = damp(this.pos.x, tx + 0.5, 8, dt);
    this.pushT += dt;
    if (!this.g.flags.pushTip) { this.g.flags.pushTip = true; this.g.toast('계속 밀면 상자가 한 칸 움직여요'); }
    if (this.pushT > 0.18) {
      if (crate.tryPush(dx, dz)) { this.g.audio.play('push'); this.squash = 0.88; }
      this.pushT = -0.12;
    }
  }
  updateLight(dt, instant = false) {
    const L = this.lantern, li = this.light;
    if (L.held) {
      const m = CFG.L[L.mode];
      const k = instant ? 1 : 1 - Math.exp(-dt * 9);
      L.y += (m.y - L.y) * k; L.fwd += (m.fwd - L.fwd) * k; L.R += (m.R - L.R) * k;
      const sway = Math.sin(this.t * 5.3) * 0.02 * clamp(this.speed / 3, 0, 1);
      li.x = this.pos.x + Math.sin(this.face) * L.fwd + Math.cos(this.face) * sway;
      li.z = this.pos.y + Math.cos(this.face) * L.fwd - Math.sin(this.face) * sway;
      li.y = L.y + Math.abs(Math.sin(this.t * 11)) * 0.02 * clamp(this.speed / 3, 0, 1);
      li.R = L.R;
    } else {
      const P = L.placed;
      li.x = P.x; li.z = P.z; li.y = P.y;
      const k = instant ? 1 : 1 - Math.exp(-dt * 5);
      L.R += (P.R - L.R) * k; li.R = L.R;
    }
  }
  syncMesh(dt) {
    const m = this.mesh;
    m.position.set(this.pos.x, 0, this.pos.y);
    m.rotation.y = this.face;
    animWalk(m, this.speed || 0, this.t, dt || 0.016, this.squash);
    if (this.occ) {
      this.occ.x = this.pos.x; this.occ.z = this.pos.y;
      setYaw(this.occ, this.face);
    }
    const li = this.light;
    this.lanternMesh.position.set(li.x, li.y, li.z);
    this.lanternMesh.rotation.y = this.face;
    const held = this.lantern.held;
    this.arm.visible = held;
    if (held) {
      // 어깨 → 등불 손잡이
      const s = new THREE.Vector3(this.pos.x + Math.cos(this.face) * 0.2, 0.74 + m.userData.inner.position.y, this.pos.y - Math.sin(this.face) * 0.2);
      const e = new THREE.Vector3(li.x, li.y + 0.2, li.z);
      const d = e.clone().sub(s);
      const len = d.length();
      this.arm.position.copy(s).addScaledVector(d, 0.5);
      this.arm.scale.set(1, len, 1);
      this.arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
    const lg = this.lanternMesh.userData;
    const fl = 1 + Math.sin(this.t * 17) * 0.03 + Math.sin(this.t * 7.3) * 0.04;
    lg.glow.scale.setScalar(1.6 * fl);
  }
}

// ---------------------------------------------------------------------------
// 2P: 그림자
// ---------------------------------------------------------------------------
const RING_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const RING_FS = `varying vec2 vUv; uniform float uHP; uniform vec3 uCol; uniform float uA;
void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); float a = atan(p.x, -p.y)/6.28318 + 0.5;
  float ring = smoothstep(0.74,0.8,r) * smoothstep(1.0,0.94,r); float f = step(a, uHP);
  vec3 c = mix(vec3(0.3,0.28,0.35), uCol, f); gl_FragColor = vec4(c, ring * uA * (0.3 + 0.7*f)); }`;

export class Shade {
  constructor(g) {
    this.g = g;
    this.mesh = makeCharacter('shade');
    g.scene.add(this.mesh);
    this.ringMat = new THREE.ShaderMaterial({
      vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false,
      uniforms: { uHP: { value: 1 }, uCol: { value: new THREE.Color(0xa98bff) }, uA: { value: 0 } },
    });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    g.scene.add(this.ring);
    this.pos = new THREE.Vector2();
    this.lastSafe = new THREE.Vector2();
    this.vx = 0; this.vz = 0; this.face = 0; this.faceT = 0; this.t = 0;
    this.hp = 1; this.state = 'alive'; this.goneT = 0;
    this.dashT = 0; this.cd = 0; this.invuln = 0; this.dashX = 0; this.dashZ = 0;
    this.lit = false; this.far = false; this.wispT = 0; this.squash = 1;
    this.hitCd = 0; this.fade = 1;
  }
  get alive() { return this.state === 'alive'; }
  reset(x, z, face = 0) {
    this.pos.set(x, z); this.lastSafe.set(x, z);
    this.vx = this.vz = 0; this.face = this.faceT = face;
    this.hp = 1; this.state = 'alive'; this.dashT = 0; this.cd = 0; this.invuln = 0.6; this.fade = 1;
    this.mesh.visible = true;
    this.syncMesh(0.016);
  }
  update(dt) {
    const g = this.g;
    this.t += dt;
    this.cd = Math.max(0, this.cd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitCd = Math.max(0, this.hitCd - dt);
    if (this.state === 'gone') {
      this.goneT -= dt;
      this.mesh.visible = false; this.ring.visible = false;
      if (this.goneT <= 0) this.respawn();
      return;
    }
    const inp = g.frozen ? ZERO_INPUT : g.input.p[1];
    if (this.dashT > 0) {
      this.dashT -= dt;
      const k = smooth(clamp(this.dashT / CFG.DASH_TIME, 0, 1));
      this.vx = this.dashX * (CFG.SHADE_SPEED + (CFG.DASH_SPEED - CFG.SHADE_SPEED) * k);
      this.vz = this.dashZ * (CFG.SHADE_SPEED + (CFG.DASH_SPEED - CFG.SHADE_SPEED) * k);
      if (Math.random() < 0.8) g.fx.puff(this.pos.x, 0.5, this.pos.y, 1, 0x2a1a4a, 0.5, 0.5, 0.2, 0.5);
    } else {
      const sp = CFG.SHADE_SPEED;
      this.vx = damp(this.vx, inp.ax * sp, 14, dt);
      this.vz = damp(this.vz, inp.az * sp, 14, dt);
      if (inp.aPressed && g.abil.dash && this.cd <= 0 && !g.frozen) {
        let dx = inp.ax, dz = inp.az;
        const m = Math.hypot(dx, dz);
        if (m < 0.2) { dx = Math.sin(this.face); dz = Math.cos(this.face); } else { dx /= m; dz /= m; }
        this.dashX = dx; this.dashZ = dz; this.dashT = CFG.DASH_TIME; this.cd = CFG.DASH_CD;
        this.faceT = Math.atan2(dx, dz);
        this.squash = 0.75;
        g.audio.play('dash');
        g.fx.burst(this.pos.x, 0.5, this.pos.y, 10, 0x9d7bff, 2.5, 0.5, 0.2);
      }
    }
    const ox = this.pos.x, oz = this.pos.y;
    moveCircle(g.room, this.pos, this.vx * dt, this.vz * dt, 0.27, 'shade');
    this.speed = Math.hypot(this.pos.x - ox, this.pos.y - oz) / Math.max(dt, 1e-4);
    if (inp.mag > 0.2 && this.dashT <= 0) this.faceT = Math.atan2(inp.ax, inp.az);
    this.face = dampAngle(this.face, this.faceT, 16, dt);
    this.squash = damp(this.squash, 1, 9, dt);

    if (!g.frozen) this.updateHP(dt);
    this.syncMesh(dt);
  }
  updateHP(dt) {
    const g = this.g;
    const e = g.exposure(this.pos.x, this.pos.y, 0.15);
    this.lit = e.lit; this.far = !e.inRange;
    const immune = this.dashT > 0 || this.invuln > 0;
    if (immune) {
      // 무적 중엔 회복도 멈춤
    } else if (e.lit) {
      this.hp -= CFG.DRAIN_LIT * dt;
      if (Math.random() < 0.5) g.fx.burst(this.pos.x, 0.3 + Math.random() * 0.8, this.pos.y, 1, 0xffa060, 1.2, 0.5, 0.14, { up: 2, grav: 1 });
      if (Math.random() < 0.3) g.fx.puff(this.pos.x, 0.8, this.pos.y, 1, 0xd8d0e8, 0.35, 0.7, 1.2, 0.35);
      g.onShadeBurn?.();
    } else if (!e.inRange) {
      this.hp -= CFG.DRAIN_FAR * dt;
      g.onShadeFar?.();
    } else {
      this.hp = Math.min(1, this.hp + CFG.REGEN * dt);
      const tx = Math.floor(this.pos.x), tz = Math.floor(this.pos.y);
      if (!g.room.solidFor(tx, tz, 'shade')) this.lastSafe.set(this.pos.x, this.pos.y);
    }
    if (this.hp <= 0) this.dissolve();
  }
  hit(amount, dx, dz) {
    if (!this.alive || this.invuln > 0 || this.dashT > 0 || this.hitCd > 0) return false;
    this.hp -= amount;
    this.hitCd = 0.6;
    this.vx += dx * 7; this.vz += dz * 7;
    this.squash = 0.7;
    this.g.audio.play('hit');
    this.g.shake(0.25);
    this.g.fx.burst(this.pos.x, 0.6, this.pos.y, 12, 0xff5566, 2.5, 0.5, 0.2);
    if (this.hp <= 0) this.dissolve();
    return true;
  }
  dissolve() {
    if (!this.alive) return;
    const g = this.g;
    this.state = 'gone';
    this.goneT = 1.1;
    this.hp = 0;
    g.fx.puff(this.pos.x, 0.6, this.pos.y, 18, 0x1a1030, 0.6, 1.2, 0.9, 0.7);
    g.fx.burst(this.pos.x, 0.7, this.pos.y, 22, 0xa98bff, 3, 0.9, 0.22);
    g.audio.play('dissolve');
    g.shake(0.2);
    g.onShadeDissolve?.();
  }
  respawn() {
    const g = this.g;
    const spot = g.findSafeSpot(this.lastSafe);
    this.pos.copy(spot);
    this.lastSafe.copy(spot);
    this.vx = this.vz = 0;
    this.hp = 1; this.state = 'alive'; this.invuln = 1.2;
    this.mesh.visible = true; this.ring.visible = true;
    this.squash = 1.4;
    g.fx.burst(spot.x, 0.6, spot.y, 18, 0xc9b6ff, 2, 0.8, 0.2);
    g.audio.play('respawn');
  }
  syncMesh(dt) {
    const m = this.mesh;
    m.position.set(this.pos.x, 0, this.pos.y);
    m.rotation.y = this.face;
    animWalk(m, this.speed || 0, this.t, dt, this.squash);
    // 흐려짐 표현: 체력이 낮거나 무적일 때 깜빡
    const u = m.userData;
    const blink = this.invuln > 0 ? 0.5 + 0.5 * Math.sin(this.t * 30) : 1;
    u.olMat.opacity = (0.35 + 0.6 * this.hp) * blink * this.fade;
    u.olMat.color.setHex(this.lit ? 0xffa070 : this.far ? 0x7f9cff : 0x8f6bff);
    u.inner.visible = this.fade > 0.02;
    for (const e of u.eyeGlows) e.material.opacity = 0.9 * this.fade;
    // 어둠의 잔상
    this.wispT -= dt;
    if (this.wispT <= 0 && this.fade > 0.5) {
      this.wispT = 0.12;
      this.g.fx.puff(this.pos.x, 0.2, this.pos.y, 1, 0x241640, 0.3, 0.9, 0.35, 0.35);
    }
    this.ring.position.set(this.pos.x, 0.03, this.pos.y);
    this.ringMat.uniforms.uHP.value = this.hp;
    const showA = this.hp < 0.995 ? 1 : 0;
    this.ringMat.uniforms.uA.value = damp(this.ringMat.uniforms.uA.value, showA * this.fade, 8, dt || 0.016);
    this.ringMat.uniforms.uCol.value.setHex(this.hp < 0.35 ? 0xff6070 : 0xb49bff);
  }
}

// ---------------------------------------------------------------------------
// 나방 가이드
// ---------------------------------------------------------------------------
export class Moth {
  constructor(g) {
    this.g = g;
    this.mesh = makeMoth();
    g.scene.add(this.mesh);
    this.pos = new THREE.Vector3(0, 1.8, 0);
    this.t = Math.random() * 10;
    this.target = null; // 컷신용 고정 위치
    this.visible = true;
  }
  update(dt) {
    this.t += dt;
    const g = this.g;
    let tx, ty, tz;
    if (this.target) { tx = this.target.x; ty = this.target.y; tz = this.target.z; }
    else {
      const li = g.bearer.light;
      tx = li.x + Math.cos(this.t * 0.9) * 0.9; ty = li.y + 0.6 + Math.sin(this.t * 1.7) * 0.25; tz = li.z + Math.sin(this.t * 0.9) * 0.9;
    }
    this.pos.x = damp(this.pos.x, tx, 3, dt); this.pos.y = damp(this.pos.y, ty, 3, dt); this.pos.z = damp(this.pos.z, tz, 3, dt);
    const m = this.mesh;
    m.visible = this.visible;
    m.position.copy(this.pos);
    m.position.y += Math.sin(this.t * 9) * 0.04;
    m.rotation.y = Math.atan2(tx - this.pos.x, tz - this.pos.z) || m.rotation.y;
    const f = Math.sin(this.t * 26) * 0.9;
    m.userData.wings[0].rotation.z = f;
    m.userData.wings[1].rotation.z = -f;
  }
}

// ---------------------------------------------------------------------------
// 상자 (1P만 밀 수 있어요. 구멍에 밀어 넣으면 다리가 돼요)
// ---------------------------------------------------------------------------
export class Crate {
  constructor(room, tx, tz) {
    this.room = room;
    this.tx = tx; this.tz = tz;
    this.x = tx + 0.5; this.z = tz + 0.5; this.y = 0;
    this.state = 'idle';
    this.mesh = makeCrate(room.ch);
    room.group.add(this.mesh);
    this.occ = room.g.occ.box(this.x, CFG.CRATE_H / 2, this.z, 0.45, CFG.CRATE_H / 2, 0.45, 0, 'crate');
    this.sync();
  }
  tryPush(dx, dz) {
    if (this.state !== 'idle') return false;
    const room = this.room, g = room.g;
    const nx = this.tx + dx, nz = this.tz + dz;
    const hole = room.isHole(nx, nz);
    if (!hole && !room.crateCanEnter(nx, nz)) return false;
    const s = g.shade;
    if (s.alive && Math.floor(s.pos.x) === nx && Math.floor(s.pos.y) === nz) { g.toast('그림자가 비켜줘야 밀 수 있어요'); return false; }
    for (const h of room.hollows) if (h.state === 'alive' && Math.floor(h.pos.x) === nx && Math.floor(h.pos.y) === nz) return false;
    this.fx = this.x; this.fz = this.z;
    this.tx = nx; this.tz = nz;
    this.state = 'slide'; this.t = 0; this.fall = hole;
    return true;
  }
  update(dt) {
    if (this.state === 'slide') {
      this.t += dt / 0.2;
      const k = smooth(Math.min(1, this.t));
      this.x = this.fx + (this.tx + 0.5 - this.fx) * k;
      this.z = this.fz + (this.tz + 0.5 - this.fz) * k;
      if (this.t >= 1) {
        this.x = this.tx + 0.5; this.z = this.tz + 0.5;
        this.state = this.fall ? 'fall' : 'idle';
        this.vy = 0;
      }
    } else if (this.state === 'fall') {
      this.vy -= 18 * dt;
      this.y += this.vy * dt;
      const bottom = -CFG.CRATE_H + 0.015;
      if (this.y <= bottom) {
        this.y = bottom;
        this.state = 'filled';
        this.room.fillHole(this.tx, this.tz);
        this.occ.on = false;
        const g = this.room.g;
        g.audio.play('fill'); g.shake(0.15);
        g.fx.puff(this.x, 0.1, this.z, 10, 0x9a8f80, 0.5, 0.8, 0.6, 0.5);
      }
    }
    this.sync();
  }
  sync() {
    this.mesh.position.set(this.x, this.y, this.z);
    this.occ.x = this.x; this.occ.z = this.z; this.occ.y = this.y + CFG.CRATE_H / 2;
  }
}

// ---------------------------------------------------------------------------
// 문
// ---------------------------------------------------------------------------
export class Door {
  constructor(room, tx, tz, def) {
    this.room = room; this.tx = tx; this.tz = tz;
    this.gname = def.g; this.latch = !!def.latch; this.invert = !!def.invert;
    this.open = 0; this.want = false; this.latched = false;
    const axisX = room.isWallish(tx - 1, tz) || room.isWallish(tx + 1, tz);
    this.mesh = makeDoor(axisX, def.g, room.pal);
    this.mesh.position.set(tx + 0.5, 0, tz + 0.5);
    room.group.add(this.mesh);
    this.occ = room.g.occ.box(tx + 0.5, CFG.DOOR_H / 2, tz + 0.5, axisX ? 0.5 : 0.15, CFG.DOOR_H / 2, axisX ? 0.15 : 0.5, 0, 'door');
    this.prevTarget = 0;
  }
  get solid() { return this.open < 0.8; }
  update(dt) {
    const room = this.room, g = room.g;
    let want = room.groupActive(this.gname);
    if (this.invert) want = !want;
    if (this.latch && want) this.latched = true;
    if (this.latched) want = true;
    if (!want && this.open > 0.3 && room.tileOccupied(this.tx, this.tz)) want = true;
    const target = want ? 1 : 0;
    if (target !== this.prevTarget) {
      g.audio.play('door');
      g.fx.puff(this.tx + 0.5, 0.2, this.tz + 0.5, 8, 0x7a7080, 0.5, 0.8, 0.4, 0.4);
      if (target) g.onDoorOpen?.(this);
      this.prevTarget = target;
    }
    this.open = clamp(this.open + (target ? 1 : -1) * dt * 1.9, 0, 1);
    const k = smooth(this.open);
    this.mesh.position.y = -k * (CFG.DOOR_H - 0.04);
    const top = CFG.DOOR_H * (1 - k);
    this.occ.on = top > 0.05;
    this.occ.hy = Math.max(0.01, top / 2); this.occ.y = top / 2;
    this.mesh.userData.runeMat.opacity = 0.55 + 0.45 * Math.sin(g.time * 3 + this.tx);
  }
}

// ---------------------------------------------------------------------------
// 트리거: 달 발판(그림자), 해 발판(1P/상자), 해바라기(등불 빛)
// ---------------------------------------------------------------------------
export class MoonPlate {
  constructor(room, tx, tz, def) {
    this.room = room; this.x = tx + 0.5; this.z = tz + 0.5; this.gname = def.g;
    this.latch = !!def.latch; this.need = def.need ?? 1.0;
    this.active = false; this.latched = false; this.holdT = 0; this.on = false;
    this.mesh = makePlate('moon');
    this.mesh.position.set(this.x, 0, this.z);
    room.group.add(this.mesh);
  }
  update(dt) {
    const g = this.room.g, s = g.shade;
    const on = s.alive && Math.hypot(s.pos.x - this.x, s.pos.y - this.z) < 0.5;
    if (on !== this.on) { g.audio.play(on ? 'plateOn' : 'plateOff'); this.on = on; }
    if (this.latch) {
      if (!this.latched) {
        this.holdT = on ? this.holdT + dt : Math.max(0, this.holdT - dt * 1.5);
        if (this.holdT >= this.need) { this.latched = true; g.audio.play('latch'); g.fx.burst(this.x, 0.3, this.z, 20, 0xb49bff, 2.5, 0.9, 0.22); }
      }
      this.active = this.latched;
    } else this.active = on;
    const u = this.mesh.userData;
    const lvl = this.active ? 1 : on ? 0.6 : 0.25;
    u.glyphMat.opacity = damp(u.glyphMat.opacity, lvl, 8, dt);
    u.glow.material.opacity = damp(u.glow.material.opacity, this.active ? 0.8 : on ? 0.35 : 0, 8, dt);
    u.disc.position.y = damp(u.disc.position.y, on ? 0.015 : 0.04, 12, dt);
    const p = this.latch ? (this.latched ? 1 : this.holdT / this.need) : 0;
    setRingProgress(u.prog, p);
  }
}

export class WeightPlate {
  constructor(room, tx, tz, def) {
    this.room = room; this.tx = tx; this.tz = tz; this.x = tx + 0.5; this.z = tz + 0.5; this.gname = def.g;
    this.latch = !!def.latch; this.active = false; this.latched = false; this.on = false;
    this.mesh = makePlate('weight');
    this.mesh.position.set(this.x, 0, this.z);
    room.group.add(this.mesh);
  }
  update(dt) {
    const room = this.room, g = room.g, b = g.bearer;
    let on = Math.hypot(b.pos.x - this.x, b.pos.y - this.z) < 0.5;
    const c = room.crateAt(this.tx, this.tz);
    if (c && c.state === 'idle') on = true;
    if (on !== this.on) { g.audio.play(on ? 'plateOn' : 'plateOff'); this.on = on; }
    if (this.latch && on) this.latched = true;
    this.active = this.latch ? this.latched : on;
    const u = this.mesh.userData;
    u.glyphMat.opacity = damp(u.glyphMat.opacity, this.active ? 1 : 0.3, 8, dt);
    u.glow.material.opacity = damp(u.glow.material.opacity, this.active ? 0.7 : 0, 8, dt);
    u.disc.position.y = damp(u.disc.position.y, on ? 0.0 : 0.04, 12, dt);
  }
}

function setRingProgress(mesh, p) {
  p = clamp(p, 0, 1);
  const key = Math.round(p * 40);
  if (mesh.userData.key === key) return;
  mesh.userData.key = key;
  mesh.geometry.dispose();
  mesh.geometry = new THREE.RingGeometry(0.46, 0.53, 32, 1, Math.PI / 2, -Math.max(0.001, (key / 40) * Math.PI * 2));
}

export class Flower {
  constructor(room, tx, tz, def) {
    this.room = room; this.x = tx + 0.5; this.z = tz + 0.5; this.gname = def.g;
    this.latch = !!def.latch; this.active = false; this.litT = 0; this.unlitT = 0; this.open = 0;
    this.mesh = makeFlower();
    this.mesh.position.set(this.x, 0, this.z);
    room.group.add(this.mesh);
    this.grey = new THREE.Color(0x9a9a9a); this.gold = new THREE.Color(0xffc93c);
  }
  update(dt) {
    const g = this.room.g;
    const e = g.exposure(this.x, this.z, 0.6);
    this.warm = e.warm;
    if (e.warm) { this.litT += dt; this.unlitT = 0; } else { this.unlitT += dt; this.litT = Math.max(0, this.litT - dt); }
    if (!this.active && this.litT > 0.5) {
      this.active = true;
      g.audio.play('bloom');
      g.fx.burst(this.x, 0.7, this.z, 26, 0xffd27a, 2.5, 1.0, 0.24);
      g.onFlower?.(this);
    }
    if (this.active && !this.latch && this.unlitT > 0.5) { this.active = false; g.audio.play('plateOff'); }
    this.open = damp(this.open, this.active ? 1 : e.warm ? 0.25 : 0, 5, dt);
    const u = this.mesh.userData;
    for (const p of u.petals) p.rotation.x = -1.2 + this.open * 1.1;
    u.head.rotation.y += dt * 0.3;
    u.petalMat.color.copy(this.grey).lerp(this.gold, this.open);
    u.centerMat.color.setHex(this.active ? 0x7a4a1a : 0x5a4a3a);
    u.glow.material.opacity = this.open * 0.8;
    u.head.position.y = 0.58 + Math.sin(g.time * 2 + this.x) * 0.02;
  }
}

// ---------------------------------------------------------------------------
// 추억 조각 (폴라로이드)
// ---------------------------------------------------------------------------
export class Memory {
  constructor(room, tx, tz, id, hidden) {
    this.room = room; this.x = tx + 0.5; this.z = tz + 0.5; this.id = id;
    this.taken = false; this.hidden = !!hidden; this.appear = hidden ? 0 : 1;
    this.mesh = makeMemory();
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.visible = !hidden;
    room.group.add(this.mesh);
  }
  reveal() {
    if (!this.hidden) return;
    this.hidden = false;
    this.mesh.visible = true;
    const g = this.room.g;
    g.fx.burst(this.x, 0.9, this.z, 40, 0xffc0dc, 3, 1.2, 0.25);
    g.audio.play('bloom');
  }
  update(dt) {
    if (this.taken || this.hidden) return;
    const g = this.room.g;
    this.appear = damp(this.appear, 1, 3, dt);
    const u = this.mesh.userData;
    u.card.rotation.y += dt * 1.4;
    u.card.position.y = 0.9 + Math.sin(g.time * 2) * 0.08;
    u.glow.position.y = u.card.position.y;
    u.ring.scale.setScalar(1 + Math.sin(g.time * 3) * 0.08);
    this.mesh.scale.setScalar(this.appear);
    if (Math.random() < dt * 6) g.fx.spark(this.x + (Math.random() - 0.5) * 0.8, 0.3 + Math.random(), this.z + (Math.random() - 0.5) * 0.8, 0xffc8e4);
    if (g.frozen) return;
    const b = g.bearer, s = g.shade;
    const near = Math.hypot(b.pos.x - this.x, b.pos.y - this.z) < 0.8 || (s.alive && Math.hypot(s.pos.x - this.x, s.pos.y - this.z) < 0.8);
    if (near) {
      this.taken = true;
      this.mesh.visible = false;
      g.fx.burst(this.x, 0.9, this.z, 50, 0xffd0e8, 3.5, 1.4, 0.28);
      g.onMemory(this);
    }
  }
}

// ---------------------------------------------------------------------------
// 출구 (둘 다 올라서야 해요)
// ---------------------------------------------------------------------------
export class Exit {
  constructor(room, tiles) {
    this.room = room; this.tiles = tiles; this.holdT = 0; this.warned = 0;
    this.meshes = tiles.map(([tx, tz]) => {
      const m = makeExitTile(); m.position.x = tx + 0.5; m.position.z = tz + 0.5; room.group.add(m); return m;
    });
    let cx = 0, cz = 0;
    for (const [tx, tz] of tiles) { cx += tx + 0.5; cz += tz + 0.5; }
    this.cx = cx / tiles.length; this.cz = cz / tiles.length;
    this.glow = makeGlow(0xffd9a0, 3.2, 0.25);
    this.glow.position.set(this.cx, 0.6, this.cz);
    room.group.add(this.glow);
    this.set = new Set(tiles.map(([x, z]) => x + ',' + z));
  }
  contains(x, z) { return this.set.has(Math.floor(x) + ',' + Math.floor(z)); }
  update(dt) {
    const room = this.room, g = room.g;
    const ready = room.exitReady();
    const t = g.time;
    for (const m of this.meshes) {
      m.material.opacity = damp(m.material.opacity, ready ? 0.65 + Math.sin(t * 3) * 0.2 : 0.14, 4, dt);
      m.rotation.z += dt * (ready ? 0.6 : 0.1);
    }
    this.glow.material.opacity = ready ? 0.5 + Math.sin(t * 2) * 0.15 : 0.1;
    if (ready && Math.random() < dt * 8) {
      const [tx, tz] = this.tiles[Math.floor(Math.random() * this.tiles.length)];
      g.fx.spark(tx + Math.random(), 0.1, tz + Math.random(), 0xffe0a8, 0.16, 1.6);
    }
    if (!ready || g.frozen) { this.holdT = 0; return; }
    const b = g.bearer, s = g.shade;
    const bIn = this.contains(b.pos.x, b.pos.y);
    const sIn = s.alive && this.contains(s.pos.x, s.pos.y);
    if (bIn && sIn) {
      if (!b.lantern.held) {
        this.warned -= dt;
        if (this.warned <= 0) { g.toast('등불을 챙겨가야 해요!'); this.warned = 4; }
        this.holdT = 0;
        return;
      }
      this.holdT += dt;
      if (this.holdT > 0.5) { this.holdT = -999; g.completeRoom(); }
    } else {
      this.holdT = 0;
      if ((bIn || sIn) && !this.hintShown) { this.hintShown = true; g.toast(bIn ? '그림자도 함께 와야 해요' : '등불도 함께 와야 해요'); }
    }
  }
}

// ---------------------------------------------------------------------------
// 회전목마 (팔의 그림자가 빙글빙글)
// ---------------------------------------------------------------------------
export class Rotor {
  constructor(room, tx, tz, opts) {
    this.room = room; this.x = tx + 0.5; this.z = tz + 0.5;
    this.arms = opts.arms ?? 2; this.len = opts.len ?? 3; this.speed = opts.speed ?? 0.6; this.y = opts.y ?? 0.5;
    this.angle = opts.phase ?? 0;
    this.mesh = makeRotor(this.arms, this.len, this.y);
    this.mesh.position.set(this.x, 0, this.z);
    room.group.add(this.mesh);
    const occ = room.g.occ;
    occ.box(this.x, 0.6, this.z, 0.18, 0.6, 0.18, 0, 'post');
    this.occs = [];
    for (let i = 0; i < this.arms; i++) this.occs.push(occ.box(this.x, this.y, this.z, this.len / 2, 0.22, 0.25, 0, 'arm'));
    this.update(0);
  }
  update(dt) {
    this.angle += this.speed * dt;
    this.mesh.userData.spin.rotation.y = -this.angle;
    for (let i = 0; i < this.arms; i++) {
      const a = this.angle + (i / this.arms) * Math.PI * 2;
      const o = this.occs[i];
      o.x = this.x + Math.cos(a) * this.len / 2;
      o.z = this.z + Math.sin(a) * this.len / 2;
      setYaw(o, -a);
    }
  }
}

// ---------------------------------------------------------------------------
// 범퍼카 (그림자만 통과할 수 있는, 움직이는 그늘)
// ---------------------------------------------------------------------------
export class Mover {
  constructor(room, def) {
    this.room = room;
    this.a = def.from; this.b = def.to; this.speed = def.speed ?? 1.5; this.phase = def.phase ?? 0;
    this.len = Math.hypot(this.b[0] - this.a[0], this.b[1] - this.a[1]);
    this.t = 0;
    const cols = [0xff6b8a, 0x6bc5ff, 0xffd36b, 0x9dff8a, 0xc49bff];
    this.mesh = makeCar(def.color ?? cols[Math.floor(Math.random() * cols.length)]);
    room.group.add(this.mesh);
    this.occ = room.g.occ.box(0, 0.3, 0, 0.42, 0.3, 0.42, 0, 'car');
    this.prevX = this.a[0]; this.prevZ = this.a[1];
    this.update(0);
  }
  update(dt) {
    this.t += dt;
    const period = (2 * this.len) / this.speed;
    const u = ((this.t / period) + this.phase) % 1;
    const s = smooth(u < 0.5 ? u * 2 : 2 - u * 2);
    const x = this.a[0] + (this.b[0] - this.a[0]) * s;
    const z = this.a[1] + (this.b[1] - this.a[1]) * s;
    const dx = x - this.prevX, dz = z - this.prevZ;
    if (Math.abs(dx) + Math.abs(dz) > 1e-4) this.mesh.rotation.y = dampAngle(this.mesh.rotation.y, Math.atan2(dx, dz), 6, Math.max(dt, 0.016));
    this.prevX = x; this.prevZ = z;
    this.mesh.position.set(x, Math.abs(Math.sin(this.t * 6)) * 0.03, z);
    this.occ.x = x; this.occ.z = z;
    setYaw(this.occ, this.mesh.rotation.y);
    this.mesh.userData.spark.material.opacity = 0.5 + Math.random() * 0.5;
  }
}

// ---------------------------------------------------------------------------
// 잊음 (그림자를 노리는 잿빛 유령. 빛에 닿으면 타버려요)
// ---------------------------------------------------------------------------
export class Hollow {
  constructor(room, tx, tz) {
    this.room = room;
    this.pos = new THREE.Vector2(tx + 0.5, tz + 0.5);
    this.home = this.pos.clone();
    this.vx = 0; this.vz = 0; this.hp = 1; this.state = 'alive'; this.stun = 0; this.t = Math.random() * 10;
    this.wander = this.home.clone(); this.wanderT = 0; this.growlT = 2 + Math.random() * 3;
    this.mesh = makeHollow();
    this.mesh.position.set(this.pos.x, 0, this.pos.y);
    room.group.add(this.mesh);
    this.face = 0;
  }
  kill() {
    if (this.state !== 'alive') return;
    const g = this.room.g;
    this.state = 'dying'; this.dieT = 0;
    g.audio.play('hollowDie');
    g.fx.puff(this.pos.x, 0.5, this.pos.y, 20, 0x8a8898, 0.6, 1.2, 1.2, 0.6);
    g.fx.burst(this.pos.x, 0.5, this.pos.y, 26, 0xffc080, 3, 0.9, 0.22);
    g.onHollowDie?.(this);
  }
  update(dt) {
    const g = this.room.g;
    this.t += dt;
    if (this.state === 'dying') {
      this.dieT += dt;
      const k = Math.max(0, 1 - this.dieT / 0.6);
      this.mesh.scale.set(1 + (1 - k) * 0.6, k, 1 + (1 - k) * 0.6);
      if (this.dieT > 0.6) { this.state = 'dead'; this.mesh.visible = false; }
      return;
    }
    if (this.state !== 'alive') return;
    const u = this.mesh.userData;
    if (g.frozen) { this.bob(dt); return; }
    const e = g.exposure(this.pos.x, this.pos.y, 0.5);
    let dx = 0, dz = 0, sp = 2.1;
    const s = g.shade;
    if (e.lit) {
      this.hp -= dt / 1.0;
      const li = g.bearer.light;
      dx = this.pos.x - li.x; dz = this.pos.y - li.z;
      sp = 2.5;
      if (Math.random() < 0.6) g.fx.burst(this.pos.x, 0.5 + Math.random() * 0.4, this.pos.y, 1, 0xffb070, 1.5, 0.5, 0.15, { up: 2, grav: 1 });
      if (Math.random() < 0.3) g.fx.puff(this.pos.x, 0.7, this.pos.y, 1, 0xbbb6c8, 0.4, 0.7, 1, 0.4);
      u.mat.emissive.setHex(0x6a3010);
    } else {
      this.hp = Math.min(1, this.hp + dt * 0.12);
      u.mat.emissive.setHex(0x15131c);
      if (s.alive && Math.hypot(s.pos.x - this.pos.x, s.pos.y - this.pos.y) < 7.5) {
        dx = s.pos.x - this.pos.x; dz = s.pos.y - this.pos.y;
        this.growlT -= dt;
        if (this.growlT <= 0) { this.growlT = 3 + Math.random() * 3; g.audio.play('hollowGrowl'); }
      } else {
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = 2 + Math.random() * 2; this.wander.set(this.home.x + (Math.random() - 0.5) * 4, this.home.y + (Math.random() - 0.5) * 4); }
        dx = this.wander.x - this.pos.x; dz = this.wander.y - this.pos.y; sp = 1.1;
      }
    }
    const m = Math.hypot(dx, dz);
    if (m > 0.05) { dx /= m; dz /= m; } else { dx = dz = 0; }
    if (this.stun > 0) { this.stun -= dt; dx = dz = 0; }
    this.vx = damp(this.vx, dx * sp, 5, dt); this.vz = damp(this.vz, dz * sp, 5, dt);
    moveCircle(this.room, this.pos, this.vx * dt, this.vz * dt, 0.3, 'hollow');
    if (Math.abs(this.vx) + Math.abs(this.vz) > 0.1) this.face = dampAngle(this.face, Math.atan2(this.vx, this.vz), 6, dt);
    // 그림자와 접촉
    if (s.alive && this.stun <= 0) {
      const ddx = s.pos.x - this.pos.x, ddz = s.pos.y - this.pos.y, d = Math.hypot(ddx, ddz);
      if (d < 0.58) {
        if (s.hit(0.3, ddx / (d || 1), ddz / (d || 1))) { this.stun = 1.1; this.vx = -ddx * 4; this.vz = -ddz * 4; }
      }
    }
    if (this.hp <= 0) { this.kill(); return; }
    this.bob(dt);
  }
  bob(dt) {
    const u = this.mesh.userData;
    this.mesh.position.set(this.pos.x, 0.08 + Math.sin(this.t * 3) * 0.06, this.pos.y);
    this.mesh.rotation.y = this.face;
    u.body.scale.set(1 + Math.sin(this.t * 5) * 0.04, 1.25 - Math.sin(this.t * 5) * 0.05, 1);
    u.tails.forEach((t, i) => (t.rotation.z = Math.sin(this.t * 6 + i) * 0.3));
    const k = 0.6 + 0.4 * this.hp;
    u.mat.opacity = 0.35 + 0.57 * k;
  }
}

// ---------------------------------------------------------------------------
// 등불 걸이(스탠드)
// ---------------------------------------------------------------------------
export class Pedestal {
  constructor(room, tx, tz) {
    this.room = room; this.x = tx + 0.5; this.z = tz + 0.5; this.has = false;
    this.mesh = makePedestal();
    this.mesh.position.set(this.x, 0, this.z);
    room.group.add(this.mesh);
  }
  update() {
    const g = this.room.g;
    const r = this.mesh.userData.ring;
    const near = g.bearer.lantern.held && Math.hypot(g.bearer.pos.x - this.x, g.bearer.pos.y - this.z) < 1.45;
    r.material.opacity = this.has ? 0.1 : near ? 0.6 + Math.sin(g.time * 6) * 0.3 : 0.25;
  }
}

// ---------------------------------------------------------------------------
// 등대의 눈 (회전하는 탐조등: 그림자를 지워요)
// ---------------------------------------------------------------------------
export class Beam {
  constructor(room, tx, tz, opts) {
    this.room = room; this.x = tx + 0.5; this.z = tz + 0.5;
    this.speed = opts.speed ?? 0.55; this.half = opts.half ?? 0.3; this.R = opts.R ?? 15; this.angle = opts.phase ?? 0;
    const g = room.g;
    this.mesh = makeTower();
    this.mesh.position.set(this.x, 0, this.z);
    room.group.add(this.mesh);
    this.towerOcc = g.occ.box(this.x, 1.0, this.z, 0.34, 1.0, 0.34, 0, 'tower');
    this.light = { type: 'beam', x: this.x, y: 2.3, z: this.z, R: this.R, on: true, warm: false, dirA: 0, half: this.half, ignore: this.towerOcc };
    this.spot = new THREE.SpotLight(0xd8ecff, 30, this.R, this.half * 1.05, 0.35, 1.2);
    this.spot.position.set(this.x, 2.3, this.z);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(g.lowPower ? 512 : 1024, g.lowPower ? 512 : 1024);
    this.spot.shadow.bias = -0.002;
    this.spot.shadow.camera.near = 0.5;
    room.group.add(this.spot);
    room.group.add(this.spot.target);
    const cone = this.mesh.userData.cone;
    const rad = Math.tan(this.half) * this.R;
    cone.scale.set(rad, rad, this.R);
    this.update(0);
  }
  update(dt) {
    this.angle += this.speed * dt;
    const dx = Math.cos(this.angle), dz = Math.sin(this.angle);
    this.light.dirA = this.angle;
    this.mesh.userData.head.rotation.y = Math.atan2(dx, dz);
    this.spot.target.position.set(this.x + dx * 6, 0, this.z + dz * 6);
    this.spot.target.updateMatrixWorld();
    const cone = this.mesh.userData.cone;
    cone.rotation.x = -Math.atan2(2.3, 6) * 0.9;
  }
}

// ---------------------------------------------------------------------------
// 거대한 등대 램프 (마지막 방)
// ---------------------------------------------------------------------------
export class GreatLamp {
  constructor(room, tx, tz) {
    this.room = room; this.x = tx + 0.5; this.z = tz + 0.5; this.ready = false; this.lit = 0;
    this.mesh = makeGreatLamp(room.pal);
    this.mesh.position.set(this.x, 0, this.z);
    room.group.add(this.mesh);
    room.g.occ.box(this.x, 0.65, this.z, 1.4, 0.65, 1.4, 0, 'lamp');
  }
  update(dt) {
    const g = this.room.g;
    const u = this.mesh.userData;
    const near = this.ready && Math.hypot(g.bearer.pos.x - this.x, g.bearer.pos.y - this.z) < 2.6;
    u.glow.material.opacity = Math.max(this.lit, this.ready ? 0.25 + (near ? 0.25 : 0) + Math.sin(g.time * 3) * 0.1 : 0);
    u.glow.scale.setScalar(6 + this.lit * 20);
    u.glassMat.emissive.setRGB(this.lit, this.lit * 0.85, this.lit * 0.6);
  }
}

export { groupColor };
