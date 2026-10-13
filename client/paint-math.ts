// 낙서 계산 — DOM·three.js 없이 테스트할 수 있는 부분만 모았다.

export type Uv = [number, number];

/** UV → 캔버스 픽셀. CanvasTexture 는 flipY 라 v = 0 이 캔버스 아래쪽이다 */
export function uvToPx(uv: Uv, w: number, h: number): [number, number] {
  return [uv[0] * w, (1 - uv[1]) * h];
}

export function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** 전송량을 줄이려고 UV 를 소수 4자리로 자른다 (2048 px 면에서도 0.2 px 오차) */
export function roundUv(uv: Uv): Uv {
  return [Math.round(uv[0] * 1e4) / 1e4, Math.round(uv[1] * 1e4) / 1e4];
}

/**
 * 직전 점과 이어 그어도 되는가. 다른 면이거나, 구·원기둥의 이음매(u 가 1 → 0)를
 * 넘어가면 텍스처를 가로지르는 선이 생기므로 획을 끊는다.
 */
export function continuesStroke(prev: { s: string; uv: Uv } | null, s: string, uv: Uv): boolean {
  if (!prev || prev.s !== s) return false;
  return Math.abs(prev.uv[0] - uv[0]) < 0.5 && Math.abs(prev.uv[1] - uv[1]) < 0.5;
}

/** 직전 점에서 붓 굵기의 1/3 이상 움직였을 때만 새 토막을 만든다 (가만히 누르고 있으면 전송 없음) */
export function movedEnough(a: Uv, b: Uv, sizeM: [number, number], brushM: number): boolean {
  const dx = (a[0] - b[0]) * sizeM[0];
  const dy = (a[1] - b[1]) * sizeM[1];
  return Math.hypot(dx, dy) >= brushM / 3;
}

export const PALETTE = [0x222222, 0xe53935, 0xfb8c00, 0xfdd835, 0x43a047, 0x1e88e5, 0x8e24aa, 0xffffff];
export const BRUSH_SIZES = [0.02, 0.05, 0.1, 0.25]; // m
