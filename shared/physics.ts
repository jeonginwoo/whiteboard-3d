// 플레이어 이동·충돌 — 축 분리 AABB. 렌더링과 분리된 순수 함수라 단위 테스트로 검사한다.
import type { Vec3 } from './world.ts';

export const PLAYER = {
  radius: 0.3,
  height: 1.7,
  eye: 1.6,
  speed: 4.5,
  jump: 7, // 점프 초속 → 최고 높이 jump² / (2·gravity) ≈ 1.22 m
  gravity: 20,
  maxFall: 30,
};

/** 사거리 — 눈에서 이 거리 안의 표면에만 그릴 수 있다 */
export const REACH = 3;

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

export interface Body {
  pos: Vec3; // 발 위치
  vel: Vec3;
  onGround: boolean;
}

const EPS = 1e-6;
const MAX_SUBSTEP = 0.2; // 한 번에 움직이는 최대 거리 — 얇은 발판(0.35 m)을 뚫고 지나가지 않게

export function jumpHeight(): number {
  return (PLAYER.jump * PLAYER.jump) / (2 * PLAYER.gravity);
}

function playerBox(p: Vec3): Aabb {
  const r = PLAYER.radius;
  return { min: [p[0] - r, p[1], p[2] - r], max: [p[0] + r, p[1] + PLAYER.height, p[2] + r] };
}

function overlaps(a: Aabb, b: Aabb): boolean {
  for (let i = 0; i < 3; i++) {
    if (a.min[i]! >= b.max[i]! - EPS || a.max[i]! <= b.min[i]! + EPS) return false;
  }
  return true;
}

/**
 * 한 프레임 진행. wish = 원하는 수평 속도 [vx, vz] (입력 방향 × 속도).
 * 입력 body 는 바꾸지 않고 새 body 를 돌려준다.
 */
export function stepBody(body: Body, wish: [number, number], jump: boolean, dt: number, solids: Aabb[]): Body {
  const pos: Vec3 = [...body.pos];
  const vel: Vec3 = [wish[0], body.vel[1], wish[1]];
  if (jump && body.onGround) vel[1] = PLAYER.jump;
  vel[1] = Math.max(-PLAYER.maxFall, vel[1] - PLAYER.gravity * dt);

  let onGround = false;
  const travel = Math.max(Math.abs(vel[0]), Math.abs(vel[1]), Math.abs(vel[2])) * dt;
  const n = Math.max(1, Math.ceil(travel / MAX_SUBSTEP));
  const sub = dt / n;

  const moveAxis = (axis: 0 | 1 | 2) => {
    const d = vel[axis] * sub;
    if (d === 0) return;
    pos[axis] += d;
    const me = playerBox(pos);
    for (const s of solids) {
      if (!overlaps(me, s)) continue;
      if (axis === 1) {
        if (d < 0) {
          pos[1] = s.max[1];
          onGround = true;
        } else {
          pos[1] = s.min[1] - PLAYER.height;
        }
      } else {
        pos[axis] = d > 0 ? s.min[axis] - PLAYER.radius : s.max[axis] + PLAYER.radius;
      }
      vel[axis] = 0;
      me.min[axis] = axis === 1 ? pos[1] : pos[axis] - PLAYER.radius;
      me.max[axis] = axis === 1 ? pos[1] + PLAYER.height : pos[axis] + PLAYER.radius;
    }
  };

  for (let i = 0; i < n; i++) {
    moveAxis(1);
    moveAxis(0);
    moveAxis(2);
  }
  return { pos, vel, onGround };
}
