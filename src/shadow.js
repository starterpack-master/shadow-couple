// 그림자 판정: "이 지점에서 빛까지 가는 선분이 무언가에 막히는가?"
// 모든 그림자 드리우는 물체는 y축 회전만 있는 박스(OBB)로 근사해요. 렌더링된 그림자와 같은 형태예요.

export function setYaw(o, yaw) {
  o.yaw = yaw;
  o.c = Math.cos(yaw);
  o.s = Math.sin(yaw);
  o.r = Math.hypot(o.hx, o.hz);
}

export class Occluders {
  constructor() {
    this.list = [];
  }
  clear() {
    this.list.length = 0;
  }
  box(x, y, z, hx, hy, hz, yaw = 0, tag = '') {
    const o = { x, y, z, hx, hy, hz, yaw: 0, c: 1, s: 0, r: 0, on: true, tag };
    setYaw(o, yaw);
    this.list.push(o);
    return o;
  }
  remove(o) {
    const i = this.list.indexOf(o);
    if (i >= 0) this.list.splice(i, 1);
  }
  // 선분 a→b 가 막히면 true. ignore 는 무시할 occluder(또는 배열)
  blocked(ax, ay, az, bx, by, bz, ignore) {
    const minx = ax < bx ? ax : bx, maxx = ax < bx ? bx : ax;
    const minz = az < bz ? az : bz, maxz = az < bz ? bz : az;
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const o = L[i];
      if (!o.on || o === ignore) continue;
      if (o.x + o.r < minx || o.x - o.r > maxx || o.z + o.r < minz || o.z - o.r > maxz) continue;
      if (segBox(o, ax, ay, az, bx, by, bz)) return true;
    }
    return false;
  }
}

function segBox(o, ax, ay, az, bx, by, bz) {
  const c = o.c, s = o.s;
  let dx = ax - o.x, dz = az - o.z;
  const lax = c * dx - s * dz, laz = s * dx + c * dz, lay = ay - o.y;
  dx = bx - o.x; dz = bz - o.z;
  const lbx = c * dx - s * dz, lbz = s * dx + c * dz, lby = by - o.y;
  let t0 = 0, t1 = 1;
  // x
  let d = lbx - lax;
  if (Math.abs(d) < 1e-9) { if (lax < -o.hx || lax > o.hx) return false; }
  else {
    let ta = (-o.hx - lax) / d, tb = (o.hx - lax) / d;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return false;
  }
  // y
  d = lby - lay;
  if (Math.abs(d) < 1e-9) { if (lay < -o.hy || lay > o.hy) return false; }
  else {
    let ta = (-o.hy - lay) / d, tb = (o.hy - lay) / d;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return false;
  }
  // z
  d = lbz - laz;
  if (Math.abs(d) < 1e-9) { if (laz < -o.hz || laz > o.hz) return false; }
  else {
    let ta = (-o.hz - laz) / d, tb = (o.hz - laz) / d;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return false;
  }
  return true;
}
