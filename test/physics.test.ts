import { describe, expect, it } from 'vitest';
import { jumpHeight, PLAYER, stepBody, type Aabb, type Body } from '../shared/physics.ts';
import { buildWorld, PILLAR, solidBox, STEP, stepObjects } from '../shared/world.ts';

const floor: Aabb = { min: [-10, -1, -10], max: [10, 0, 10] };

function run(body: Body, frames: number, wish: [number, number] = [0, 0], solids = [floor], jumpAt = -1): Body {
  let b = body;
  for (let i = 0; i < frames; i++) b = stepBody(b, wish, i === jumpAt, 1 / 60, solids);
  return b;
}

describe('stepBody', () => {
  it('떨어지다가 바닥 위에 선다', () => {
    const b = run({ pos: [0, 3, 0], vel: [0, 0, 0], onGround: false }, 120);
    expect(b.pos[1]).toBeCloseTo(0, 5);
    expect(b.onGround).toBe(true);
  });

  it('벽을 뚫지 못한다', () => {
    const wall: Aabb = { min: [2, 0, -5], max: [3, 3, 5] };
    const b = run({ pos: [0, 0, 0], vel: [0, 0, 0], onGround: true }, 120, [PLAYER.speed, 0], [floor, wall]);
    expect(b.pos[0]).toBeCloseTo(2 - PLAYER.radius, 5);
  });

  it('점프는 땅에 있을 때만, 최고 높이는 jumpHeight', () => {
    let b: Body = { pos: [0, 0, 0], vel: [0, 0, 0], onGround: true };
    let top = 0;
    for (let i = 0; i < 90; i++) {
      b = stepBody(b, [0, 0], true, 1 / 120, [floor]);
      top = Math.max(top, b.pos[1]);
    }
    expect(top).toBeGreaterThan(jumpHeight() * 0.95);
    expect(top).toBeLessThan(jumpHeight() * 1.05);
  });

  it('빠르게 떨어져도 얇은 발판을 뚫지 않는다', () => {
    const slab: Aabb = { min: [-1, 5, -1], max: [1, 5.35, 1] };
    const b = run({ pos: [0, 30, 0], vel: [0, -PLAYER.maxFall, 0], onGround: false }, 200, [0, 0], [floor, slab]);
    expect(b.pos[1]).toBeCloseTo(5.35, 5);
  });

  it('입력 body 를 바꾸지 않는다', () => {
    const b: Body = { pos: [0, 1, 0], vel: [0, 0, 0], onGround: false };
    stepBody(b, [1, 0], false, 1 / 60, [floor]);
    expect(b.pos).toEqual([0, 1, 0]);
  });
});

describe('월드 배치', () => {
  it('발판 한 칸 높이가 점프로 오를 수 있는 높이다 (사거리 제한의 전제: 위로는 올라타서 간다)', () => {
    expect(STEP.firstTop).toBeLessThan(jumpHeight());
    expect(STEP.rise).toBeLessThan(jumpHeight());
  });

  it('마지막 발판에서 기둥 꼭대기로 오를 수 있다', () => {
    const steps = stepObjects();
    const lastTop = steps.at(-1)!.center[1] + STEP.thickness / 2;
    expect(PILLAR.height - lastTop).toBeLessThan(jumpHeight());
    expect(PILLAR.height - lastTop).toBeGreaterThan(0);
  });

  it('이웃한 발판은 수평으로 맞닿아 있다 (건너뛸 틈이 없다)', () => {
    const steps = stepObjects();
    for (let i = 1; i < steps.length; i++) {
      const a = steps[i - 1]!.center;
      const b = steps[i]!.center;
      expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeCloseTo(STEP.size, 5);
    }
  });

  it('발판은 기둥을 파고들지 않는다', () => {
    const pillar = solidBox(buildWorld().find((o) => o.id === 'pillar')!);
    for (const s of stepObjects()) {
      const b = solidBox(s);
      const insideX = b.min[0] < pillar.max[0] - 1e-6 && b.max[0] > pillar.min[0] + 1e-6;
      const insideZ = b.min[2] < pillar.max[2] - 1e-6 && b.max[2] > pillar.min[2] + 1e-6;
      expect(insideX && insideZ).toBe(false);
    }
  });

  it('물체 id 가 겹치지 않는다 (낙서면 id 의 기준)', () => {
    const ids = buildWorld().map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
