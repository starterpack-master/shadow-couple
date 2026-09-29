// 게임 전역 수치. 그림자 판정(로직)과 렌더링이 같은 값을 쓰도록 여기서만 정의해요.
export const CFG = {
  WALL_H: 2.0,
  PILLAR_H: 2.0,
  PILLAR_R: 0.32,
  BLOCK_H: 0.75,
  CRATE_H: 0.72,
  DOOR_H: 2.0,
  BODY_H: 1.3,
  CLIFF: 1.4,

  // 등불 상태별 높이(y)/반경(R)/앞쪽 오프셋(fwd)
  L: {
    low: { y: 0.95, R: 7.0, fwd: 0.5 },
    high: { y: 1.75, R: 9.5, fwd: 0.22 },
    ground: { y: 0.42, R: 6.5 },
    pedestal: { y: 2.45, R: 12.0 },
  },

  BEARER_SPEED: 3.8,
  SHADE_SPEED: 4.6,
  DASH_SPEED: 13.5,
  DASH_TIME: 0.2,
  DASH_CD: 0.85,
  RADIUS: 0.3,

  DRAIN_LIT: 0.62, // 빛 속: 약 1.6초면 흩어짐
  DRAIN_FAR: 0.4, // 등불에서 너무 멀면: 약 2.5초
  REGEN: 0.6,
};

export const IS_TOUCH = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
export const IS_MOBILE = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const smooth = (t) => t * t * (3 - 2 * t);
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const dampAngle = (a, b, k, dt) => a + angDiff(a, b) * (1 - Math.exp(-k * dt));
export function rng(seed) {
  let s = (seed | 0) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
