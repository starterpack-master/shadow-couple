import * as THREE from 'three';

// 머리 위로 떠오르는 하트 (서로의 폰에도 똑같이 보여요)
let heartTex = null;
function makeHeartTex() {
  if (heartTex) return heartTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 70);
  const path = () => {
    g.beginPath();
    g.moveTo(0, 38);
    g.bezierCurveTo(-60, 0, -40, -52, 0, -22);
    g.bezierCurveTo(40, -52, 60, 0, 0, 38);
    g.closePath();
  };
  g.shadowColor = 'rgba(255,120,170,0.9)'; g.shadowBlur = 18;
  path(); g.fillStyle = '#ff7fab'; g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 5; g.strokeStyle = '#fff0f6'; path(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath(); g.ellipse(-18, -14, 9, 6, -0.6, 0, Math.PI * 2); g.fill();
  heartTex = new THREE.CanvasTexture(c);
  heartTex.colorSpace = THREE.SRGBColorSpace;
  return heartTex;
}

export class Emotes {
  constructor(g) {
    this.g = g;
    this.list = [];
  }
  show(ch, kind = 'heart') {
    const mat = new THREE.SpriteMaterial({ map: makeHeartTex(), transparent: true, depthWrite: false, depthTest: false });
    const s = new THREE.Sprite(mat);
    s.renderOrder = 20;
    s.scale.setScalar(0.01);
    this.g.scene.add(s);
    this.list.push({ s, ch, t: 0, ox: (Math.random() - 0.5) * 0.3 });
    const p = ch.pos;
    for (let i = 0; i < 6; i++) this.g.fxRaw.spark(p.x + (Math.random() - 0.5) * 0.6, 1.4 + Math.random() * 0.5, p.y + (Math.random() - 0.5) * 0.6, 0xff9fc8, 0.14, 1.0);
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t += dt;
      const u = e.t / 1.6;
      const pop = u < 0.15 ? u / 0.15 : 1;
      const k = pop * (1 + Math.sin(e.t * 14) * 0.06 * (1 - u));
      e.s.scale.setScalar(0.75 * k);
      e.s.position.set(e.ch.pos.x + e.ox + Math.sin(e.t * 4) * 0.08, 1.9 + u * 0.9, e.ch.pos.y);
      e.s.material.opacity = u > 0.7 ? Math.max(0, 1 - (u - 0.7) / 0.3) : 1;
      if (u >= 1) { this.g.scene.remove(e.s); e.s.material.dispose(); this.list.splice(i, 1); }
    }
  }
}
