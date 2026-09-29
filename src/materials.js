import * as THREE from 'three';
import { rng } from './config.js';

// ---------------------------------------------------------------------------
// 등불 반경 밖을 "허공처럼" 어둡게 만드는 셰이더 패치 (모든 환경 재질 공용)
// ---------------------------------------------------------------------------
export const U = {
  uL1: { value: new THREE.Vector4(0, 0, 0, 7) },
  uL2: { value: new THREE.Vector4(0, 0, 0, 0) },
  uVoid: { value: 0.3 },
};

export function patch(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uL1 = U.uL1;
    sh.uniforms.uL2 = U.uL2;
    sh.uniforms.uVoid = U.uVoid;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 wq = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wq = instanceMatrix * wq;
          #endif
          vWPos = (modelMatrix * wq).xyz;
        }`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform vec4 uL1;\nuniform vec4 uL2;\nuniform float uVoid;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        {
          float k = smoothstep(uL1.w + 0.6, uL1.w - 1.0, distance(vWPos.xz, uL1.xz));
          if (uL2.w > 0.0) k = max(k, smoothstep(uL2.w + 0.6, uL2.w - 1.0, distance(vWPos.xz, uL2.xz)));
          gl_FragColor.rgb *= mix(uVoid, 1.0, k);
        }`
      );
  };
  mat.customProgramCacheKey = () => 'voidpatch1';
  return mat;
}

export function lambert(opts) {
  return patch(new THREE.MeshLambertMaterial(opts));
}

// ---------------------------------------------------------------------------
// 챕터별 팔레트: 추억이 돌아올수록 세상에 색이 돌아와요.
// ---------------------------------------------------------------------------
export const PAL = {
  0: { sky: ['#0e0c16', '#241d33'], fog: '#161222', floor: '#6f6d78', wall: '#4b4957', wallTop: '#8a8795', cliff: '#1d1b26',
    hemiS: '#8a90b8', hemiG: '#2a2438', hemiI: 0.55, lamp: '#ffb35c', voidK: 0.3, floorTex: 'cobble', wallTex: 'brick' },
  1: { sky: ['#12151f', '#2b3040'], fog: '#1c1f2c', floor: '#75767d', wall: '#4d505c', wallTop: '#8d909a', cliff: '#1f212a',
    hemiS: '#8b95c0', hemiG: '#2a2a3a', hemiI: 0.75, lamp: '#ffb35c', voidK: 0.3, floorTex: 'cobble', wallTex: 'brick' },
  2: { sky: ['#1a1230', '#4a2f5c'], fog: '#2a1c3c', floor: '#8a7f98', floor2: '#9b8ca3', wall: '#5e4a78', wallTop: '#c79fd0', cliff: '#221a30',
    hemiS: '#b49ce0', hemiG: '#3a2448', hemiI: 0.75, lamp: '#ffba62', voidK: 0.32, floorTex: 'checker', wallTex: 'tent' },
  3: { sky: ['#1e140f', '#4d3423'], fog: '#2d2016', floor: '#a0764f', wall: '#6d4c3a', wallTop: '#c9a27c', cliff: '#3a2a1e',
    hemiS: '#e0b890', hemiG: '#3a2618', hemiI: 0.72, lamp: '#ffbd66', voidK: 0.34, floorTex: 'wood', wallTex: 'books' },
  4: { sky: ['#070b16', '#1a2438'], fog: '#0f1522', floor: '#4b5263', wall: '#343b4d', wallTop: '#5a6479', cliff: '#10141d',
    hemiS: '#6f86b8', hemiG: '#141a28', hemiI: 0.62, lamp: '#ffb05a', voidK: 0.26, floorTex: 'asphalt', wallTex: 'building' },
  5: { sky: ['#3b2a5c', '#ff9a6b'], fog: '#b5707a', floor: '#d8c3a0', wall: '#e9e2d6', wallTop: '#fff6ea', cliff: '#6b5a58',
    hemiS: '#ffd0b0', hemiG: '#6a4a6a', hemiI: 0.72, lamp: '#ffc070', voidK: 0.4, floorTex: 'stone', wallTex: 'stonewall' },
};

// ---------------------------------------------------------------------------
// 캔버스 텍스처 생성기 (에셋 파일 없이 전부 코드로)
// ---------------------------------------------------------------------------
function cvs(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
export function hexShift(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return '#' + c.getHexString();
}
function toTex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const texCache = new Map();
export function tex(kind, base, alt) {
  const key = kind + base + (alt || '');
  if (texCache.has(key)) return texCache.get(key);
  const t = toTex(PAINT[kind](base, alt));
  texCache.set(key, t);
  return t;
}

const PAINT = {
  cobble(base) {
    const [c, g] = cvs(128, 128);
    const R = rng(7);
    g.fillStyle = hexShift(base, -0.16); g.fillRect(0, 0, 128, 128);
    const stones = [[4, 4, 58, 58], [66, 4, 58, 28], [66, 36, 58, 26], [4, 66, 28, 58], [36, 66, 26, 58], [66, 66, 58, 58]];
    for (const [x, y, w, h] of stones) {
      g.fillStyle = hexShift(base, (R() - 0.5) * 0.08);
      rr(g, x, y, w, h, 9); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.06)'; rr(g, x + 3, y + 3, w - 10, h * 0.35, 7); g.fill();
    }
    grain(g, 128, 128, 0.05, R);
    return c;
  },
  brick(base) {
    const [c, g] = cvs(64, 128);
    const R = rng(3);
    g.fillStyle = hexShift(base, -0.12); g.fillRect(0, 0, 64, 128);
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? 16 : 0;
      for (let x = -32; x < 64; x += 32) {
        g.fillStyle = hexShift(base, (R() - 0.5) * 0.1);
        g.fillRect(x + off + 1, row * 16 + 1, 30, 14);
      }
    }
    grain(g, 64, 128, 0.06, R);
    return c;
  },
  checker(base, alt) {
    const [c, g] = cvs(128, 128);
    const a = base, b = alt || hexShift(base, 0.08);
    g.fillStyle = a; g.fillRect(0, 0, 128, 128);
    g.fillStyle = b; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 3; g.strokeRect(2, 2, 124, 124);
    g.fillStyle = 'rgba(255,230,255,0.16)';
    for (const [x, y] of [[32, 32], [96, 96]]) { star(g, x, y, 7); }
    grain(g, 128, 128, 0.04, rng(11));
    return c;
  },
  tent(base) {
    const [c, g] = cvs(64, 128);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? hexShift(base, 0.1) : hexShift(base, -0.04);
      g.fillRect(i * 16, 0, 16, 128);
    }
    g.fillStyle = 'rgba(255,220,140,0.9)';
    for (let x = 4; x < 64; x += 12) { g.beginPath(); g.arc(x, 10, 2.4, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 118, 64, 10);
    return c;
  },
  wood(base) {
    const [c, g] = cvs(128, 128);
    const R = rng(5);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = hexShift(base, (R() - 0.5) * 0.08);
      g.fillRect(0, i * 32, 128, 32);
      g.strokeStyle = 'rgba(40,20,5,0.18)'; g.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        g.beginPath(); const y = i * 32 + 5 + k * 7 + R() * 3; g.moveTo(0, y);
        g.bezierCurveTo(40, y + R() * 4 - 2, 80, y + R() * 4 - 2, 128, y); g.stroke();
      }
      g.fillStyle = 'rgba(30,15,5,0.35)'; g.fillRect(0, i * 32 + 30, 128, 2);
      g.fillRect(((i * 53) % 100) + 10, i * 32, 2, 32);
    }
    return c;
  },
  books(base) {
    const [c, g] = cvs(64, 128);
    const R = rng(9);
    const cols = ['#a44a3f', '#3f6fa4', '#d9a441', '#5a8f5a', '#8a5aa4', '#e0d2b4', '#b85c7a'];
    g.fillStyle = hexShift(base, -0.1); g.fillRect(0, 0, 64, 128);
    for (let shelf = 0; shelf < 2; shelf++) {
      let x = 0;
      while (x < 64) {
        const w = 6 + Math.floor(R() * 7), h = 40 + Math.floor(R() * 20);
        g.fillStyle = cols[Math.floor(R() * cols.length)];
        g.fillRect(x, shelf * 64 + 64 - h, w - 1, h);
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 1, shelf * 64 + 64 - h + 6, w - 3, 2);
        x += w;
      }
      g.fillStyle = hexShift(base, -0.2); g.fillRect(0, shelf * 64 + 60, 64, 4);
    }
    return c;
  },
  asphalt(base) {
    const [c, g] = cvs(128, 128);
    const R = rng(13);
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    grain(g, 128, 128, 0.12, R);
    g.fillStyle = 'rgba(160,190,255,0.10)';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(R() * 128, R() * 128, 14 + R() * 18, 6 + R() * 8, R() * 3, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 126);
    return c;
  },
  building(base) {
    const [c, g] = cvs(64, 128);
    const R = rng(17);
    g.fillStyle = base; g.fillRect(0, 0, 64, 128);
    for (let y = 10; y < 118; y += 26) {
      for (let x = 8; x < 60; x += 28) {
        const lit = R() < 0.3;
        g.fillStyle = lit ? 'rgba(255,205,130,0.85)' : 'rgba(10,14,26,0.8)';
        g.fillRect(x, y, 18, 16);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, y, 18, 3);
      }
    }
    return c;
  },
  stone(base) {
    const [c, g] = cvs(128, 128);
    const R = rng(19);
    g.fillStyle = hexShift(base, -0.12); g.fillRect(0, 0, 128, 128);
    const cells = [[3, 3, 76, 60], [83, 3, 42, 60], [3, 67, 44, 58], [51, 67, 74, 58]];
    for (const [x, y, w, h] of cells) { g.fillStyle = hexShift(base, (R() - 0.5) * 0.07); rr(g, x, y, w, h, 6); g.fill(); }
    grain(g, 128, 128, 0.05, R);
    return c;
  },
  stonewall(base) {
    const [c, g] = cvs(64, 128);
    const R = rng(23);
    g.fillStyle = hexShift(base, -0.1); g.fillRect(0, 0, 64, 128);
    for (let row = 0; row < 6; row++) {
      const off = row % 2 ? 20 : 0;
      for (let x = -40; x < 64; x += 40) { g.fillStyle = hexShift(base, (R() - 0.5) * 0.06); rr(g, x + off + 1, row * 21.3 + 1, 38, 19.3, 3); g.fill(); }
    }
    return c;
  },
  crate(base) {
    const [c, g] = cvs(128, 128);
    g.fillStyle = hexShift(base, -0.05); g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(40,20,5,0.3)'; g.lineWidth = 2;
    for (let y = 24; y < 128; y += 26) { g.beginPath(); g.moveTo(10, y); g.lineTo(118, y); g.stroke(); }
    g.fillStyle = hexShift(base, -0.2);
    g.fillRect(0, 0, 128, 12); g.fillRect(0, 116, 128, 12); g.fillRect(0, 0, 12, 128); g.fillRect(116, 0, 12, 128);
    g.save(); g.translate(64, 64); g.rotate(Math.PI / 4); g.fillRect(-80, -7, 160, 14); g.restore();
    g.fillStyle = 'rgba(20,10,0,0.5)';
    for (const [x, y] of [[6, 6], [122, 6], [6, 122], [122, 122]]) { g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill(); }
    return c;
  },
};

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr2 = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
  }
  g.closePath(); g.fill();
}
function grain(g, w, h, amt, R) {
  const n = Math.floor(w * h * 0.08);
  for (let i = 0; i < n; i++) {
    g.fillStyle = R() < 0.5 ? `rgba(0,0,0,${amt})` : `rgba(255,255,255,${amt * 0.7})`;
    g.fillRect(Math.floor(R() * w), Math.floor(R() * h), 1, 1);
  }
}

// ---------------------------------------------------------------------------
// 발광 스프라이트 / 문양 텍스처
// ---------------------------------------------------------------------------
let glowTexCache = null;
export function glowTex() {
  if (glowTexCache) return glowTexCache;
  const [c, g] = cvs(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowTexCache = toTex(c, false);
  return glowTexCache;
}
export function makeGlow(color, size, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, size);
  return s;
}

const glyphCache = new Map();
export function glyphTex(kind) {
  if (glyphCache.has(kind)) return glyphCache.get(kind);
  const [c, g] = cvs(128, 128);
  g.translate(64, 64);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 6; g.lineCap = 'round';
  if (kind === 'moon') {
    g.beginPath(); g.arc(0, 0, 54, 0, Math.PI * 2); g.lineWidth = 4; g.stroke();
    g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(13, -9, 26, 0, Math.PI * 2); g.fill();
  } else if (kind === 'sun') {
    g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath(); g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); g.lineTo(Math.cos(a) * 46, Math.sin(a) * 46); g.stroke();
    }
    g.beginPath(); g.arc(0, 0, 56, 0, Math.PI * 2); g.lineWidth = 3; g.stroke();
  } else if (kind === 'rune') {
    g.lineWidth = 5;
    g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(0, -38); g.lineTo(0, 38); g.moveTo(-26, -14); g.lineTo(0, 10); g.lineTo(26, -14); g.stroke();
    g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
  } else if (kind === 'exit') {
    g.lineWidth = 4;
    g.beginPath(); g.arc(0, 0, 56, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, 42, 0, Math.PI * 2); g.setLineDash([6, 8]); g.stroke(); g.setLineDash([]);
    // 하트 두 개가 겹친 문양
    heart(g, -9, 2, 17); g.stroke(); heart(g, 9, 2, 17); g.stroke();
  } else if (kind === 'ring') {
    const gr = g.createRadialGradient(0, 0, 40, 0, 0, 62);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 62, 0, Math.PI * 2); g.fill();
  }
  const t = toTex(c, false);
  glyphCache.set(kind, t);
  return t;
}
function heart(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.6, y - s * 1.2, x, y - s * 0.45);
  g.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
}

export function polaroidTex() {
  const [c, g] = cvs(96, 112);
  g.fillStyle = '#fbf6ec'; g.fillRect(0, 0, 96, 112);
  const gr = g.createLinearGradient(0, 8, 0, 84);
  gr.addColorStop(0, '#ffcfa8'); gr.addColorStop(1, '#b78bd8');
  g.fillStyle = gr; g.fillRect(8, 8, 80, 72);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = 'bold 44px serif'; g.textAlign = 'center'; g.fillText('?', 48, 60);
  return toTex(c, false);
}
