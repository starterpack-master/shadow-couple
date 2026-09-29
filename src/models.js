import * as THREE from 'three';
import { CFG } from './config.js';
import { lambert, makeGlow, glyphTex, tex, polaroidTex, hexShift } from './materials.js';

const V = (x, y) => new THREE.Vector2(x, y);
const shadowy = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };

// ---------------------------------------------------------------------------
// 캐릭터
// ---------------------------------------------------------------------------
const BODY_A = [V(0.001, 0), V(0.34, 0.02), V(0.33, 0.12), V(0.29, 0.34), V(0.24, 0.56), V(0.19, 0.74), V(0.13, 0.83), V(0.001, 0.86)];
const BODY_B = [V(0.001, 0), V(0.33, 0.02), V(0.31, 0.12), V(0.27, 0.34), V(0.22, 0.56), V(0.18, 0.74), V(0.12, 0.83), V(0.001, 0.86)];
const HEAD_Y = 1.06;

// kind: 'bearer' (1P), 'shade' (2P 그림자), 'person2' (엔딩의 2P, 색이 있는 모습)
export function makeCharacter(kind) {
  const root = new THREE.Group();
  const inner = new THREE.Group(); // 애니메이션(찌그러짐/흔들림)용
  root.add(inner);
  const isShade = kind === 'shade';
  const parts = [];

  let bodyMat, skinMat, hairMat, accentMat;
  if (isShade) {
    bodyMat = skinMat = hairMat = accentMat = new THREE.MeshBasicMaterial({ color: 0x0b0814 });
  } else if (kind === 'bearer') {
    bodyMat = lambert({ color: 0xf1e4cc });
    skinMat = lambert({ color: 0xffe2cc });
    hairMat = lambert({ color: 0x4a3226 });
    accentMat = lambert({ color: 0xe0474c });
  } else {
    bodyMat = lambert({ color: 0xb9a6ea });
    skinMat = lambert({ color: 0xffe0cc });
    hairMat = lambert({ color: 0x2c2130 });
    accentMat = lambert({ color: 0xff9fc8 });
  }

  const body = new THREE.Mesh(new THREE.LatheGeometry(kind === 'bearer' ? BODY_A : BODY_B, 18), bodyMat);
  inner.add(body); parts.push(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), skinMat);
  head.position.y = HEAD_Y;
  inner.add(head); parts.push(head);

  // 머리카락: 1P는 짧은 머리, 2P는 긴 머리 + 삐침머리(아호게) + 리본 → 실루엣이 달라요 (복선)
  if (kind === 'bearer') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    cap.position.set(0, HEAD_Y + 0.02, -0.025); cap.rotation.x = -0.25;
    inner.add(cap); parts.push(cap);
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), hairMat);
    fringe.scale.set(1.6, 0.6, 0.8); fringe.position.set(0.08, HEAD_Y + 0.2, 0.18);
    inner.add(fringe); parts.push(fringe);
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.305, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
    cap.position.set(0, HEAD_Y + 0.015, -0.03); cap.rotation.x = -0.5;
    inner.add(cap); parts.push(cap);
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), hairMat);
    back.scale.set(1.05, 1.45, 0.72); back.position.set(0, HEAD_Y - 0.2, -0.13);
    inner.add(back); parts.push(back);
    const ahoge = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 6, 12, Math.PI * 1.2), hairMat);
    ahoge.position.set(0.02, HEAD_Y + 0.33, 0.02); ahoge.rotation.set(0, Math.PI / 2, 0.6);
    inner.add(ahoge); parts.push(ahoge);
    for (const s of [-1, 1]) {
      const bow = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 8), accentMat);
      bow.rotation.z = (s * Math.PI) / 2;
      bow.position.set(0.2 + s * 0.07, HEAD_Y + 0.22, -0.05);
      inner.add(bow); parts.push(bow);
    }
  }

  // 목도리
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.06, 8, 18), accentMat);
  scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.84;
  inner.add(scarf); parts.push(scarf);
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0.08, 0.84, -0.12);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.035), accentMat);
  tail.position.y = -0.17;
  tailPivot.add(tail);
  inner.add(tailPivot); parts.push(tail);

  // 눈
  const eyes = [];
  const eyeMat = isShade ? new THREE.MeshBasicMaterial({ color: 0xf1ebff }) : new THREE.MeshBasicMaterial({ color: 0x241a1a });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(isShade ? 0.046 : 0.038, 10, 8), eyeMat);
    e.position.set(s * 0.1, HEAD_Y + 0.01, 0.255);
    e.scale.set(1, 1.25, 0.6);
    inner.add(e); eyes.push(e);
  }
  if (!isShade) {
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xff9aa2, transparent: true, opacity: 0.55 });
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), blushMat);
      b.position.set(s * 0.16, HEAD_Y - 0.06, 0.245); b.rotation.y = s * 0.45;
      inner.add(b);
    }
  }

  const outlines = [];
  if (isShade) {
    // 보라색 테두리: 어둠 속에서도 보이도록
    const olMat = new THREE.MeshBasicMaterial({ color: 0x8f6bff, side: THREE.BackSide, transparent: true, opacity: 0.9 });
    for (const p of parts) {
      const o = new THREE.Mesh(p.geometry, olMat);
      o.position.copy(p.position); o.rotation.copy(p.rotation); o.scale.copy(p.scale).multiplyScalar(1.1);
      if (p === tail) { o.position.set(0, -0.17, 0); tailPivot.add(o); } else inner.add(o);
      outlines.push(o);
    }
    const eg = [];
    for (const e of eyes) { const g = makeGlow(0xd9ccff, 0.22, 0.9); g.position.copy(e.position); g.position.z += 0.03; inner.add(g); eg.push(g); }
    root.userData.eyeGlows = eg;
    root.userData.olMat = olMat;
  }
  for (const p of parts) { p.castShadow = !isShade; p.receiveShadow = !isShade; }
  eyes.forEach((e) => (e.castShadow = false));

  root.userData = Object.assign(root.userData, { inner, tailPivot, eyes, parts, outlines, head, bodyMat });
  return root;
}

export function makeLantern() {
  const g = new THREE.Group();
  const brass = lambert({ color: 0x6b4a2a });
  const frameGeo = new THREE.BoxGeometry(0.03, 0.2, 0.03);
  for (const [x, z] of [[-0.075, -0.075], [0.075, -0.075], [-0.075, 0.075], [0.075, 0.075]]) {
    const m = new THREE.Mesh(frameGeo, brass); m.position.set(x, 0, z); g.add(m);
  }
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.08, 4), brass); top.position.y = 0.14; top.rotation.y = Math.PI / 4; g.add(top);
  const bot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.03, 0.19), brass); bot.position.y = -0.1; g.add(bot);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), brass); handle.position.y = 0.2; g.add(handle);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.18, 0.15), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.35 }));
  g.add(glass);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c8 }));
  g.add(core);
  const glow = makeGlow(0xffc070, 1.6, 0.9); g.add(glow);
  const glow2 = makeGlow(0xffe2b0, 0.45, 1); g.add(glow2);
  g.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  g.userData = { glow, glow2, core };
  return g;
}

export function makeMoth() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.1, 4, 8), mat);
  body.rotation.x = Math.PI / 2; g.add(body);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.bezierCurveTo(0.08, 0.12, 0.22, 0.12, 0.2, 0.0); wingShape.bezierCurveTo(0.2, -0.08, 0.1, -0.1, 0, 0);
  const wg = new THREE.ShapeGeometry(wingShape);
  const wings = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    const w = new THREE.Mesh(wg, mat);
    w.rotation.x = -Math.PI / 2; w.scale.x = s;
    piv.add(w); g.add(piv); wings.push(piv);
  }
  const glow = makeGlow(0xffe7a0, 0.9, 0.8); g.add(glow);
  g.userData = { wings, glow };
  return g;
}

// ---------------------------------------------------------------------------
// 소품
// ---------------------------------------------------------------------------
export function makePillar(ch, pal) {
  const g = new THREE.Group();
  if (ch === 3) { // 거대 색연필
    const col = [0xe0584f, 0x4f8fe0, 0xf2c14e, 0x5cb85c][Math.floor(Math.random() * 4)];
    const m = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(CFG.PILLAR_R, CFG.PILLAR_R, CFG.PILLAR_H - 0.35, 6), lambert({ color: col })));
    m.position.y = (CFG.PILLAR_H - 0.35) / 2; g.add(m);
    const tip = shadowy(new THREE.Mesh(new THREE.ConeGeometry(CFG.PILLAR_R, 0.35, 6), lambert({ color: 0xf3d9b1 })));
    tip.position.y = CFG.PILLAR_H - 0.175; g.add(tip);
  } else if (ch === 5) { // 바위 기둥
    const m = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(CFG.PILLAR_R * 0.9, CFG.PILLAR_R * 1.15, CFG.PILLAR_H, 7), lambert({ color: hexShift(pal.wall, -0.25) })));
    m.position.y = CFG.PILLAR_H / 2; m.rotation.y = Math.random() * 3; g.add(m);
  } else {
    const col = ch === 2 ? 0xf0d2e6 : ch === 4 ? 0x5a6275 : 0x8b8a93;
    const m = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(CFG.PILLAR_R * 0.92, CFG.PILLAR_R, CFG.PILLAR_H, 12), lambert({ color: col })));
    m.position.y = CFG.PILLAR_H / 2; g.add(m);
    const cap = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(CFG.PILLAR_R * 1.15, CFG.PILLAR_R * 1.15, 0.12, 12), lambert({ color: hexShift('#' + new THREE.Color(col).getHexString(), 0.08) })));
    cap.position.y = CFG.PILLAR_H - 0.06; g.add(cap);
  }
  return g;
}

export function makeBlock(ch, pal) {
  const g = new THREE.Group();
  let m;
  if (ch === 3) {
    const col = [0xe86a5c, 0x6aa2e8, 0xf5c95c, 0x7cc47c][Math.floor(Math.random() * 4)];
    m = new THREE.Mesh(new THREE.BoxGeometry(0.9, CFG.BLOCK_H, 0.9), lambert({ color: col }));
  } else if (ch === 5) {
    m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52, 0), lambert({ color: hexShift(pal.wall, -0.3) }));
    m.scale.set(1, CFG.BLOCK_H / 1.0, 1); m.position.y = -0.1;
  } else if (ch === 2) {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.9, CFG.BLOCK_H, 0.9), lambert({ color: 0xc57fa8 }));
  } else {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.9, CFG.BLOCK_H, 0.9), lambert({ color: hexShift(pal.wall, 0.06) }));
  }
  m.position.y += CFG.BLOCK_H / 2;
  shadowy(m); g.add(m);
  return g;
}

export function makeCrate(ch) {
  const base = ch === 3 ? '#c9793a' : ch === 4 ? '#8a7a66' : '#a8784a';
  const m = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.9, CFG.CRATE_H, 0.9), lambert({ map: tex('crate', base) })));
  m.position.y = CFG.CRATE_H / 2;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

const GROUP_COLORS = { a: 0xffc46b, b: 0x7fe0ff, c: 0xff8fc4, d: 0xa6ff8f };
export function groupColor(g) {
  return GROUP_COLORS[g] ?? 0xffffff;
}

export function makeDoor(axisX, group, pal) {
  const g = new THREE.Group();
  const w = axisX ? 1.0 : 0.3, d = axisX ? 0.3 : 1.0;
  const slab = shadowy(new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, CFG.DOOR_H, d * 0.98), lambert({ color: hexShift(pal.wall, -0.06) })));
  slab.position.y = CFG.DOOR_H / 2;
  g.add(slab);
  const col = groupColor(group);
  const runeMat = new THREE.MeshBasicMaterial({ map: glyphTex('rune'), color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), runeMat);
    r.position.y = 1.05;
    if (axisX) { r.position.z = s * 0.16; r.rotation.y = s > 0 ? 0 : Math.PI; } else { r.position.x = s * 0.16; r.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; }
    g.add(r);
  }
  const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.08, d + 0.02), new THREE.MeshBasicMaterial({ color: col }));
  trim.position.y = CFG.DOOR_H - 0.04; g.add(trim);
  g.userData = { runeMat };
  return g;
}

export function makePedestal() {
  const g = new THREE.Group();
  const iron = lambert({ color: 0x3a3440 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.18, 12), iron); base.position.y = 0.09; g.add(base);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.3, 8), iron); post.position.y = 1.2; g.add(post);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 12, Math.PI), iron); hook.position.set(0.16, 2.35, 0); g.add(hook);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 24), new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  g.userData = { ring };
  return g;
}

export function makePlate(kind) {
  const g = new THREE.Group();
  const moon = kind === 'moon';
  const discMat = lambert({ color: moon ? 0x2a2140 : 0x8a8272 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.08, 24), discMat);
  disc.position.y = 0.04; disc.receiveShadow = true; g.add(disc);
  const col = moon ? 0xb49bff : 0xffcf7a;
  const gl = new THREE.MeshBasicMaterial({ map: glyphTex(moon ? 'moon' : 'sun'), color: col, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
  const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.72), gl);
  glyph.rotation.x = -Math.PI / 2; glyph.position.y = 0.085; g.add(glyph);
  const progMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const prog = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.53, 32, 1, 0, 0.001), progMat);
  prog.rotation.x = -Math.PI / 2; prog.position.y = 0.09; g.add(prog);
  const glow = makeGlow(col, 1.4, 0); glow.position.y = 0.3; g.add(glow);
  g.userData = { disc, glyphMat: gl, prog, glow };
  return g;
}

export function makeFlower() {
  const g = new THREE.Group();
  const stemMat = lambert({ color: 0x5f8f4a });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.55, 6), stemMat); stem.position.y = 0.275; g.add(stem);
  for (const s of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), stemMat); leaf.scale.set(1.6, 0.3, 0.7); leaf.position.set(s * 0.1, 0.22, 0); leaf.rotation.z = s * 0.4; g.add(leaf);
  }
  const head = new THREE.Group(); head.position.y = 0.58; g.add(head);
  const petalMat = lambert({ color: 0x9a9a9a });
  const petals = [];
  for (let i = 0; i < 10; i++) {
    const piv = new THREE.Group(); piv.rotation.y = (i / 10) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), petalMat);
    p.scale.set(0.6, 0.25, 1.7); p.position.z = 0.11;
    piv.add(p); head.add(piv); petals.push(piv);
  }
  const centerMat = new THREE.MeshBasicMaterial({ color: 0x5a4a3a });
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), centerMat); center.scale.y = 0.5; head.add(center);
  const glow = makeGlow(0xffd27a, 1.3, 0); glow.position.y = 0.6; g.add(glow);
  g.traverse((o) => { o.castShadow = false; });
  g.userData = { head, petals, petalMat, centerMat, glow };
  return g;
}

export function makeMemory() {
  const g = new THREE.Group();
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.54), new THREE.MeshBasicMaterial({ map: polaroidTex(), side: THREE.DoubleSide }));
  card.position.y = 0.9; g.add(card);
  const glow = makeGlow(0xffd0e8, 1.8, 0.7); glow.position.y = 0.9; g.add(glow);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.42, 32), new THREE.MeshBasicMaterial({ color: 0xffc0dc, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  g.userData = { card, glow, ring };
  return g;
}

export function makeExitTile() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshBasicMaterial({ map: glyphTex('exit'), color: 0xffd9a0, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.025;
  return m;
}

export function makeRotor(arms, len, y) {
  const g = new THREE.Group();
  const postMat = lambert({ color: 0xe8c9a0 });
  const post = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.2, 10), postMat)); post.position.y = 0.6; g.add(post);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), lambert({ color: 0xffd27a })); top.position.y = 1.25; top.castShadow = false; g.add(top);
  const spin = new THREE.Group(); g.add(spin);
  const armMat = lambert({ color: 0xf2e6d8 });
  const stripe = lambert({ color: 0xd9577a });
  const horseMat = lambert({ color: 0xfff4e6 });
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2;
    const piv = new THREE.Group(); piv.rotation.y = -a; spin.add(piv);
    const bar = shadowy(new THREE.Mesh(new THREE.BoxGeometry(len, 0.44, 0.5), i % 2 ? stripe : armMat));
    bar.position.set(len / 2, y, 0); piv.add(bar);
    // 끝의 목마 (그림자는 팔 박스가 담당)
    const horse = new THREE.Group(); horse.position.set(len - 0.35, y + 0.34, 0);
    const hb = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 4, 8), horseMat); hb.rotation.z = Math.PI / 2; horse.add(hb);
    const hh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), horseMat); hh.position.set(0.18, 0.1, 0); horse.add(hh);
    horse.traverse((o) => (o.castShadow = false));
    horse.rotation.y = Math.PI / 2;
    piv.add(horse);
    const lamp = makeGlow(0xffd8a0, 0.35, 0.7); lamp.position.set(len, y + 0.1, 0); piv.add(lamp);
  }
  g.userData = { spin };
  return g;
}

export function makeCar(color) {
  const g = new THREE.Group();
  const bodyM = lambert({ color });
  const body = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.42, 0.82), bodyM)); body.position.y = 0.3; g.add(body);
  const bumper = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.07, 6, 20), lambert({ color: 0x2a2a33 }));
  bumper.rotation.x = Math.PI / 2; bumper.position.y = 0.14; bumper.scale.set(1, 1.02, 1); bumper.castShadow = true; g.add(bumper);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.2), lambert({ color: hexShift('#' + new THREE.Color(color).getHexString(), -0.2) }));
  seat.position.set(0, 0.6, -0.22); seat.castShadow = true; g.add(seat);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 5), lambert({ color: 0x999999 })); pole.position.set(0, 1.1, -0.3); pole.castShadow = false; g.add(pole);
  const spark = makeGlow(0x9fd8ff, 0.5, 0.9); spark.position.set(0, 1.8, -0.3); g.add(spark);
  g.userData = { spark };
  return g;
}

export function makeHollow() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x5a5866, transparent: true, opacity: 0.92, emissive: 0x15131c });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), mat);
  body.scale.set(1, 1.25, 1); body.position.y = 0.48; g.add(body);
  const tails = [];
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), mat);
    const a = (i / 5) * Math.PI * 2;
    t.position.set(Math.cos(a) * 0.2, 0.12, Math.sin(a) * 0.2); t.rotation.x = Math.PI; g.add(t); tails.push(t);
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff4d5e });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat); e.position.set(s * 0.12, 0.58, 0.29); e.scale.set(1.3, 0.6, 0.5); g.add(e);
  }
  const eg = makeGlow(0xff4d5e, 0.8, 0.6); eg.position.set(0, 0.58, 0.3); g.add(eg);
  g.traverse((o) => { o.castShadow = false; });
  g.userData = { body, tails, mat, eg };
  return g;
}

export function makeTower() {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 32; c.height = 64;
  const x = c.getContext('2d');
  for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#d9463f' : '#f4efe6'; x.fillRect(0, i * 16, 32, 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const body = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 2.0, 14), lambert({ map: t }))); body.position.y = 1.0; g.add(body);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 14), lambert({ color: 0x333338 })); deck.position.y = 2.02; g.add(deck);
  const head = new THREE.Group(); head.position.y = 2.3; g.add(head);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.34, 12), new THREE.MeshBasicMaterial({ color: 0xdff2ff })); head.add(lamp);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.3, 12), lambert({ color: 0xd9463f })); roof.position.y = 0.32; head.add(roof);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.3), new THREE.MeshBasicMaterial({ color: 0x223 })); hood.position.set(0, 0, -0.18); head.add(hood);
  // 빛줄기 원뿔
  const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true);
  coneGeo.translate(0, -0.5, 0); coneGeo.rotateX(-Math.PI / 2);
  const coneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color(0xcfe8ff) } },
    vertexShader: 'varying float vZ; void main(){ vZ = -position.z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uCol; varying float vZ; void main(){ gl_FragColor = vec4(uCol, 0.16 * (1.0 - vZ)); }',
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.castShadow = false;
  head.add(cone);
  const glow = makeGlow(0xdff2ff, 1.6, 0.9); head.add(glow);
  g.traverse((o) => { if (o !== body) o.castShadow = false; });
  g.userData = { head, cone };
  return g;
}

export function makeGreatLamp(pal) {
  const g = new THREE.Group();
  const stone = lambert({ color: hexShift(pal.wall, -0.1) });
  const base = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 1.3, 20), stone)); base.position.y = 0.65; g.add(base);
  const rim = shadowy(new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.08, 6, 24), lambert({ color: 0x8a6a3a }))); rim.rotation.x = Math.PI / 2; rim.position.y = 1.32; g.add(rim);
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.35, emissive: 0x000000 });
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), glassMat); glass.position.y = 1.3; glass.castShadow = false; g.add(glass);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 12), new THREE.MeshLambertMaterial({ color: 0x9fb8d8, transparent: true, opacity: 0.6 }));
  lens.position.y = 1.75; lens.castShadow = false; g.add(lens);
  const glow = makeGlow(0xffe0a0, 6, 0); glow.position.y = 1.8; g.add(glow);
  g.userData = { glassMat, glow };
  return g;
}

// 추억 사진 안에 쓰일 작은 빛나는 점 (반딧불)
export function makeFirefly(color = 0xfff0a0) {
  return makeGlow(color, 0.25, 0.9);
}
