import * as THREE from 'three';
import { glowTex } from './materials.js';

// CPU 파티클 (Points 한 번의 draw call). additive(빛) / normal(연기) 두 종류.
const VS = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vA; varying vec3 vC; uniform float uScale;
void main(){
  vA = aAlpha; vC = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
varying float vA; varying vec3 vC; uniform sampler2D uTex;
void main(){
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vC, t.a * vA);
}`;

class PSystem {
  constructor(scene, n, additive) {
    this.n = n;
    this.parts = [];
    this.free = [];
    for (let i = n - 1; i >= 0; i--) this.free.push(i);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -999;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTex: { value: glowTex() }, uScale: { value: 400 } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 9;
    scene.add(this.points);
    this.geo = g;
  }
  emit(o) {
    if (!this.free.length) return;
    const i = this.free.pop();
    const c = new THREE.Color(o.color ?? 0xffffff);
    this.parts.push({
      i, x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: o.life || 1, t: 0, size: o.size || 0.3, grow: o.grow ?? 0, a: o.alpha ?? 1,
      drag: o.drag ?? 1.5, grav: o.grav ?? 0, r: c.r, g: c.g, b: c.b, flick: o.flick || 0,
    });
  }
  update(dt) {
    const P = this.parts;
    for (let k = P.length - 1; k >= 0; k--) {
      const p = P[k];
      p.t += dt;
      const i = p.i;
      if (p.t >= p.life) {
        this.pos[i * 3 + 1] = -999; this.alpha[i] = 0;
        this.free.push(i); P[k] = P[P.length - 1]; P.pop();
        continue;
      }
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const u = p.t / p.life;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
      this.size[i] = p.size * (1 + p.grow * u);
      let a = p.a * Math.min(1, u * 6) * (1 - u) * (1 - u * 0.2);
      if (p.flick) a *= 0.6 + 0.4 * Math.sin(p.t * p.flick + i);
      this.alpha[i] = a;
    }
    const g = this.geo;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }
  clear() {
    for (const p of this.parts) { this.pos[p.i * 3 + 1] = -999; this.alpha[p.i] = 0; this.free.push(p.i); }
    this.parts.length = 0;
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.glow = new PSystem(scene, 700, true);
    this.smoke = new PSystem(scene, 400, false);
    this.rain = null;
    this.rainOn = false;
    this.dustT = 0;
  }
  setScale(h) {
    const s = h * 0.9;
    this.glow.mat.uniforms.uScale.value = s;
    this.smoke.mat.uniforms.uScale.value = s;
  }
  burst(x, y, z, n, color, speed = 2, life = 0.8, size = 0.25, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.8);
      const r = Math.sqrt(1 - u * u);
      this.glow.emit({
        x, y, z, vx: Math.cos(a) * r * s, vy: Math.abs(u) * s * (opts.up ?? 1), vz: Math.sin(a) * r * s,
        life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), color,
        drag: opts.drag ?? 2.2, grav: opts.grav ?? -1, alpha: opts.alpha ?? 1,
      });
    }
  }
  puff(x, y, z, n, color, size = 0.5, life = 1.0, rise = 0.8, alpha = 0.6) {
    for (let i = 0; i < n; i++) {
      this.smoke.emit({
        x: x + (Math.random() - 0.5) * 0.3, y: y + Math.random() * 0.2, z: z + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 0.6, vy: rise * (0.5 + Math.random()), vz: (Math.random() - 0.5) * 0.6,
        life: life * (0.7 + Math.random() * 0.6), size: size * (0.7 + Math.random() * 0.6), grow: 1.4, color, alpha, drag: 1.2,
      });
    }
  }
  spark(x, y, z, color, size = 0.18, life = 1.2) {
    this.glow.emit({ x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: 0.3 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.3, life, size, color, drag: 0.8, flick: 12 });
  }
  // 등불 주변에 떠다니는 빛 먼지
  dust(dt, lx, ly, lz, R, color) {
    this.dustT += dt;
    while (this.dustT > 0.07) {
      this.dustT -= 0.07;
      const a = Math.random() * Math.PI * 2, r = Math.random() * Math.min(R * 0.55, 4);
      this.glow.emit({
        x: lx + Math.cos(a) * r, y: 0.2 + Math.random() * 2.0, z: lz + Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 0.15, vy: 0.05 + Math.random() * 0.12, vz: (Math.random() - 0.5) * 0.15,
        life: 2.5 + Math.random() * 2, size: 0.05 + Math.random() * 0.07, color, alpha: 0.7, drag: 0.1, flick: 3,
      });
    }
  }
  setRain(on) {
    this.rainOn = on;
    if (on && !this.rain) {
      const N = 700;
      const g = new THREE.BufferGeometry();
      const p = new Float32Array(N * 6);
      this.rainData = [];
      for (let i = 0; i < N; i++) this.rainData.push({ x: (Math.random() - 0.5) * 40, y: Math.random() * 14, z: (Math.random() - 0.5) * 30, s: 16 + Math.random() * 8 });
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const m = new THREE.LineBasicMaterial({ color: 0xaac4ee, transparent: true, opacity: 0.32, depthWrite: false });
      this.rain = new THREE.LineSegments(g, m);
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
    }
    if (this.rain) this.rain.visible = on;
  }
  updateRain(dt, cx, cz) {
    if (!this.rain || !this.rainOn) return;
    const p = this.rain.geometry.attributes.position.array;
    const D = this.rainData;
    for (let i = 0; i < D.length; i++) {
      const d = D[i];
      d.y -= d.s * dt;
      if (d.y < 0) {
        d.y = 12 + Math.random() * 4; d.x = (Math.random() - 0.5) * 40; d.z = (Math.random() - 0.5) * 30;
        if (Math.random() < 0.12) this.glow.emit({ x: cx + d.x * 0.5, y: 0.05, z: cz + d.z * 0.5, vy: 0.6, life: 0.25, size: 0.1, color: 0x9fb8e0, alpha: 0.5, drag: 5, grav: -4 });
      }
      const x = cx + d.x, z = cz + d.z;
      p[i * 6] = x; p[i * 6 + 1] = d.y; p[i * 6 + 2] = z;
      p[i * 6 + 3] = x + 0.08; p[i * 6 + 4] = d.y + 0.55; p[i * 6 + 5] = z + 0.04;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }
  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
  }
  clear() {
    this.glow.clear();
    this.smoke.clear();
  }
}
