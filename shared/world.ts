// 월드 배치 — 클라이언트(메시·낙서면 생성)와 물리(충돌 상자)가 함께 쓰는 순수 데이터.
// 좌표: y 가 위, 바닥 윗면이 y = 0. 단위는 미터. center 는 물체의 중심, size 는 전체 크기
// (구·원기둥은 size[0] 이 지름).

export type Vec3 = [number, number, number];
export type Shape = 'box' | 'cylinder' | 'sphere';

export interface WorldObject {
  id: string;
  shape: Shape;
  center: Vec3;
  size: Vec3;
  color: number; // 낙서면 바탕색 — 지우개는 이 색으로 칠한다
  density: number; // 낙서면 해상도 (px / m)
  solid: boolean; // 충돌 여부
}

export const ARENA_HALF = 15; // 바닥은 x, z ∈ [-15, 15]
export const WALL = { height: 3, thickness: 0.4 };
export const PILLAR = { half: 2, height: 10 };
/** 기둥에 붙은 공중 발판(나선 계단). 한 칸 오를 때 rise 만큼 높아진다 — 점프 높이보다 낮아야 한다 */
// 크기는 기둥 한 변 둘레에 정확히 4칸이 들어가게: 2·half + size = 4·size
export const STEP = { size: (PILLAR.half * 2) / 3, thickness: 0.35, firstTop: 0.8, rise: 0.75 };

/** 플레이어 아바타 — 몸통·머리 두 상자. 다른 참가자가 여기에 낙서한다 */
export const AVATAR = {
  density: 160,
  body: { size: [0.6, 1.15, 0.35] as Vec3, y: 0.575 },
  head: { size: [0.45, 0.45, 0.45] as Vec3, y: 1.4 },
};

/** 나선 계단 발판 위치 — 기둥 둘레(정사각형)를 따라 한 칸씩 돌며 올라간다 */
export function stepObjects(): WorldObject[] {
  const ring = PILLAR.half + STEP.size / 2; // 발판 안쪽 면이 기둥 면에 닿는다
  const side = ring * 2;
  const perSide = Math.round(side / STEP.size);
  // 둘레를 도는 네 변: 시작 모서리와 진행 방향
  const corners: [number, number, number, number][] = [
    [-ring, -ring, 1, 0],
    [ring, -ring, 0, 1],
    [ring, ring, -1, 0],
    [-ring, ring, 0, -1],
  ];
  const out: WorldObject[] = [];
  for (let k = 0; ; k++) {
    const top = STEP.firstTop + k * STEP.rise;
    if (top > PILLAR.height - 0.1) break;
    const corner = corners[Math.floor(k / perSide) % 4]!;
    const along = (k % perSide) * STEP.size;
    out.push({
      id: `step${k}`,
      shape: 'box',
      center: [corner[0] + corner[2] * along, top - STEP.thickness / 2, corner[1] + corner[3] * along],
      size: [STEP.size, STEP.thickness, STEP.size],
      color: 0xc8a46e,
      density: 64,
      solid: true,
    });
  }
  return out;
}

function box(id: string, center: Vec3, size: Vec3, color: number, density: number): WorldObject {
  return { id, shape: 'box', center, size, color, density, solid: true };
}

export function buildWorld(): WorldObject[] {
  const h = ARENA_HALF;
  const t = WALL.thickness;
  const wy = WALL.height / 2;
  return [
    box('floor', [0, -0.1, 0], [h * 2, 0.2, h * 2], 0xd9dde3, 32),
    box('wallN', [0, wy, -h - t / 2], [h * 2 + t * 2, WALL.height, t], 0xe8e4da, 32),
    box('wallS', [0, wy, h + t / 2], [h * 2 + t * 2, WALL.height, t], 0xe8e4da, 32),
    box('wallW', [-h - t / 2, wy, 0], [t, WALL.height, h * 2], 0xe8e4da, 32),
    box('wallE', [h + t / 2, wy, 0], [t, WALL.height, h * 2], 0xe8e4da, 32),
    // 중앙 화이트보드 기둥 — 해상도를 가장 높게
    box('pillar', [0, PILLAR.height / 2, 0], [PILLAR.half * 2, PILLAR.height, PILLAR.half * 2], 0xffffff, 128),
    ...stepObjects(),
    // 흩어진 오브젝트 — 올라타기·낙서용
    box('crate1', [5, 0.5, 5], [1, 1, 1], 0xb08850, 96),
    box('crate2', [6.2, 0.5, 5], [1, 1, 1], 0xb08850, 96),
    box('crate3', [6.2, 1.5, 5], [1, 1, 1], 0xb08850, 96),
    box('crate4', [-6, 0.6, -4], [1.2, 1.2, 1.2], 0xa47a46, 96),
    box('table', [-6, 0.5, 6], [3, 1, 2], 0x8d6e63, 64),
    { id: 'drum', shape: 'cylinder', center: [8, 0.6, -6], size: [1, 1.2, 1], color: 0x4f7cac, density: 96, solid: true },
    { id: 'ball', shape: 'sphere', center: [-8, 1, -8], size: [2, 2, 2], color: 0xf2c14e, density: 64, solid: true },
  ];
}

/**
 * 모양별 낙서면의 실제 크기(가로, 세로 m). 순서는 three.js 지오메트리의 material 그룹 순서와 같다.
 * box: +x −x +y −y +z −z / cylinder: 옆면 윗면 아랫면 / sphere: 한 장
 */
export function faceSizes(shape: Shape, size: Vec3): [number, number][] {
  const [sx, sy, sz] = size;
  if (shape === 'box') return [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  if (shape === 'cylinder') return [[Math.PI * sx, sy], [sx, sx], [sx, sx]];
  return [[Math.PI * sx, (Math.PI * sx) / 2]];
}

/** 낙서면 캔버스 픽셀 크기 — 너무 작거나 큰 텍스처를 막는다 */
export function facePixels(meters: number, density: number): number {
  return Math.min(2048, Math.max(8, Math.round(meters * density)));
}

/** 물리용 충돌 상자. 구는 안쪽으로 조금 줄인다 (상자로 근사하므로 모서리가 허공에 뜨지 않게) */
export function solidBox(o: WorldObject): { min: Vec3; max: Vec3 } {
  const k = o.shape === 'sphere' ? 0.8 : 1;
  const hx = (o.size[0] * k) / 2;
  const hy = (o.size[1] * k) / 2;
  const hz = (o.size[2] * k) / 2;
  const [cx, cy, cz] = o.center;
  return { min: [cx - hx, cy - hy, cz - hz], max: [cx + hx, cy + hy, cz + hz] };
}

export const SPAWN: Vec3 = [0, 0, 8];
