// 개발 전용 `?demo` — 헤드리스 스크린샷(scripts/shot.sh "/?demo")은 키·마우스를 못 보내므로
// 오버레이를 숨기고 시점을 고정한 뒤 견본 낙서를 그려 렌더링을 눈으로 확인하게 한다.
// main.ts 가 import.meta.env.DEV 일 때만 동적으로 불러온다 — 배포 번들에는 들어가지 않는다.
import type { Seg } from '../shared/protocol.ts';
import { Avatar } from './avatar.ts';
import type { SurfaceRegistry } from './surfaces.ts';

export interface DemoHooks {
  registry: SurfaceRegistry;
  addAvatar(a: Avatar): void;
  setPose(pos: [number, number, number], yaw: number, pitch: number): void;
}

function scribble(s: string, c: number, w: number, cx: number, cy: number, r: number): Seg[] {
  const out: Seg[] = [];
  let prev: [number, number] = [cx + r, cy];
  for (let i = 1; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const p: [number, number] = [cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.8];
    out.push({ s, a: prev, b: p, c, w });
    prev = p;
  }
  return out;
}

export function runDemo(h: DemoHooks): void {
  document.getElementById('overlay')?.classList.add('hidden');
  h.setPose([4.5, 0, 7.5], 0.55, 0.12);
  const segs: Seg[] = [
    ...scribble('pillar:4', 0xe53935, 0.08, 0.5, 0.2, 0.25), // 기둥 앞면(+z) 아래쪽
    { s: 'pillar:4', a: [0.15, 0.08], b: [0.85, 0.1], c: 0x1e88e5, w: 0.1 },
    ...scribble('pillar:0', 0x43a047, 0.06, 0.4, 0.15, 0.2), // 기둥 오른쪽 면(+x)
    ...scribble('crate1:4', 0x8e24aa, 0.06, 0.5, 0.5, 0.3),
    ...scribble('floor:2', 0x222222, 0.1, 0.55, 0.3, 0.03),
  ];
  h.addAvatar(new Avatar({ id: 'demo', name: '친구', color: 0xbf616a, state: { p: [2.5, 0, 4], yaw: -2.62, pitch: 0 } }, h.registry));
  segs.push(...scribble('p:demo:body:5', 0xfdd835, 0.05, 0.5, 0.6, 0.3), ...scribble('p:demo:head:5', 0x222222, 0.03, 0.5, 0.3, 0.2));
  for (const s of segs) h.registry.apply(s);
}
