import * as THREE from 'three';
import { makeCharacter, } from './models.js';
import { makeGlow } from './materials.js';

// 엔딩: 병실의 아침. 창문 빛이 두 사람의 그림자를 벽에 하나로 겹쳐 그려요.
export class Hospital {
  constructor(g) {
    this.g = g;
    this.group = new THREE.Group();
    g.scene.add(this.group);
    const G = this.group;
    const M = (c) => new THREE.MeshLambertMaterial({ color: c });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), M(0xd9c7b0));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; G.add(floor);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), M(0xf3ebe0));
    back.position.set(0, 3, -2.6); back.receiveShadow = true; G.add(back);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), M(0xeee4d6));
    left.rotation.y = Math.PI / 2; left.position.set(-4.5, 3, 2); left.receiveShadow = true; G.add(left);
    const skirting = new THREE.Mesh(new THREE.BoxGeometry(14, 0.18, 0.05), M(0xc9b59a)); skirting.position.set(0, 0.09, -2.57); G.add(skirting);

    // 창문 (오른쪽 앞)
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }));
    win.position.set(3.2, 2.6, -2.58); G.add(win);
    const frameM = M(0xffffff);
    for (const [x, y, w, h] of [[3.2, 3.8, 2.4, 0.1], [3.2, 1.4, 2.4, 0.1], [2.0, 2.6, 0.1, 2.5], [4.4, 2.6, 0.1, 2.5], [3.2, 2.6, 0.06, 2.4]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frameM); f.position.set(x, y, -2.55); G.add(f);
    }
    const sunGlow = makeGlow(0xffe2b0, 5, 0.6); sunGlow.position.set(3.2, 2.8, -2.4); G.add(sunGlow);

    // 침대
    const bed = new THREE.Group(); bed.position.set(-1.2, 0, -0.9); G.add(bed);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 1.3), M(0xe6e6ea)); frame.position.y = 0.45; frame.castShadow = true; frame.receiveShadow = true; bed.add(frame);
    const matt = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.2, 1.2), M(0xffffff)); matt.position.y = 0.78; matt.receiveShadow = true; bed.add(matt);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 1.3), M(0xd0d4dc)); head.position.set(-1.3, 0.9, 0); head.castShadow = true; bed.add(head);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.8), M(0xf8f8ff)); pillow.position.set(-0.95, 0.94, 0); pillow.receiveShadow = true; bed.add(pillow);
    for (const [x, z] of [[-1.2, -0.55], [1.2, -0.55], [-1.2, 0.55], [1.2, 0.55]]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), M(0xaaaaaa)); l.position.set(x, 0.12, z); bed.add(l);
    }

    // 1P: 누워 있어요 (얼굴은 카메라 쪽)
    const A = makeCharacter('bearer');
    A.rotation.z = Math.PI / 2;
    A.position.set(-0.05, 1.05, 0.05);
    bed.add(A);
    A.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.A = A;
    this.eyes = A.userData.eyes;
    for (const e of this.eyes) e.scale.y = 0.12;
    const blanket = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.7, 20), M(0xa8c4e6));
    blanket.rotation.z = Math.PI / 2; blanket.scale.x = 0.42; // 납작한 이불
    blanket.position.set(0.35, 0.9, 0); blanket.castShadow = true; blanket.receiveShadow = true; bed.add(blanket);

    // 2P: 침대 너머 의자에 앉아 손을 잡고 있어요 (색이 돌아온 모습)
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.5, 14), M(0x9a7a5a)); stool.position.set(0.15, 0.25, -2.0); stool.castShadow = true; G.add(stool);
    const B = makeCharacter('person2');
    B.position.set(0.15, 0.45, -2.0);
    B.rotation.y = -0.75;
    B.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    G.add(B);
    this.B = B;
    const handA = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), M(0xffe2cc)); handA.position.set(-0.55, 1.0, -1.25); handA.castShadow = true; G.add(handA);
    const handB = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), M(0xffe0cc)); handB.position.set(-0.42, 1.02, -1.33); handB.castShadow = true; G.add(handB);
    const armB = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.85, 6), M(0xb9a6ea));
    const s0 = new THREE.Vector3(0.0, 1.2, -1.85), e0 = handB.position.clone();
    armB.position.copy(s0).lerp(e0, 0.5);
    armB.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), e0.clone().sub(s0).normalize());
    armB.scale.y = s0.distanceTo(e0) / 0.85; armB.castShadow = true; G.add(armB);

    // 심전도 모니터
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.3), M(0x4a4a55)); mon.position.set(-3.2, 1.6, -2.3); G.add(mon);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.36), new THREE.MeshBasicMaterial({ color: 0x0a2a1a })); scr.position.set(-3.2, 1.6, -2.14); G.add(scr);
    this.blip = makeGlow(0x6dff9a, 0.25, 1); this.blip.position.set(-3.2, 1.6, -2.1); G.add(this.blip);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), M(0x888888)); pole.position.set(-3.2, 0.7, -2.3); G.add(pole);
    // 꽃병 (해바라기)
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.35, 10), M(0x8fb8d8)); vase.position.set(2.6, 0.95, -2.2); G.add(vase);
    const table = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.78, 0.6), M(0xc9a57f)); table.position.set(2.6, 0.39, -2.2); table.castShadow = true; G.add(table);
    for (let i = 0; i < 3; i++) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M(0xffc93c)); fl.position.set(2.5 + i * 0.1, 1.35 + (i % 2) * 0.08, -2.2); fl.scale.y = 0.5; G.add(fl);
    }

    // 창문 햇빛
    this.sun = new THREE.DirectionalLight(0xffe0b8, 0.2);
    this.sun.position.set(6, 3.2, 5);
    this.sun.target.position.set(-1, 1, -2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -6; sc.right = 6; sc.top = 5; sc.bottom = -3; sc.near = 0.5; sc.far = 20;
    this.sun.shadow.bias = -0.0015;
    G.add(this.sun, this.sun.target);
    this.amb = new THREE.HemisphereLight(0xfff4e8, 0xb09a88, 0.5);
    G.add(this.amb);

    this.t = 0;
    this.camT = 0;
    this.eyeOpen = 0;
    this.beepT = 0;
    this.camFrom = new THREE.Vector3(0.9, 2.5, 5.6);
    this.camTo = new THREE.Vector3(0.1, 2.3, 4.8);
    this.lookFrom = new THREE.Vector3(-0.5, 0.95, -1.2);
    this.lookTo = new THREE.Vector3(-0.6, 1.7, -2.5);
    this.camK = 0;
    this.camKTarget = 0;
  }
  update(dt) {
    this.t += dt;
    const g = this.g;
    this.sun.intensity += (3.2 - this.sun.intensity) * (1 - Math.exp(-dt * 0.5));
    for (const e of this.eyes) e.scale.y += (0.12 + this.eyeOpen * 1.13 - e.scale.y) * (1 - Math.exp(-dt * 3));
    this.beepT -= dt;
    if (this.beepT <= 0) { this.beepT = 1.0; g.audio.play('beep'); this.blip.material.opacity = 1; }
    this.blip.material.opacity *= Math.exp(-dt * 3);
    this.camK += (this.camKTarget - this.camK) * (1 - Math.exp(-dt * 0.6));
    const cam = g.camera;
    cam.position.lerpVectors(this.camFrom, this.camTo, this.camK);
    cam.position.x += Math.sin(this.t * 0.3) * 0.05;
    const look = new THREE.Vector3().lerpVectors(this.lookFrom, this.lookTo, this.camK);
    cam.lookAt(look);
    this.B.userData.inner.rotation.x = 0.12 + Math.sin(this.t * 1.2) * 0.02;
  }
  dispose() {
    this.g.scene.remove(this.group);
  }
}
