import { describe, expect, it } from 'vitest';
import { parseLobbyLink } from '../client/lobby-link.ts';
import { continuesStroke, hexColor, movedEnough, roundUv, uvToPx } from '../client/paint-math.ts';
import { facePixels, faceSizes } from '../shared/world.ts';

describe('paint-math', () => {
  it('UV → 픽셀은 v 를 뒤집는다', () => {
    expect(uvToPx([0, 0], 100, 50)).toEqual([0, 50]);
    expect(uvToPx([1, 1], 100, 50)).toEqual([100, 0]);
  });

  it('hexColor 는 6자리', () => {
    expect(hexColor(0x00ff00)).toBe('#00ff00');
    expect(hexColor(0)).toBe('#000000');
  });

  it('roundUv 는 소수 4자리', () => {
    expect(roundUv([0.123456, 0.98765])).toEqual([0.1235, 0.9877]);
  });

  it('다른 면이나 이음매를 넘어가면 획을 끊는다', () => {
    const prev = { s: 'ball:0', uv: [0.98, 0.5] as [number, number] };
    expect(continuesStroke(null, 'ball:0', [0.5, 0.5])).toBe(false);
    expect(continuesStroke(prev, 'ball:0', [0.97, 0.52])).toBe(true);
    expect(continuesStroke(prev, 'ball:0', [0.01, 0.5])).toBe(false);
    expect(continuesStroke(prev, 'pillar:4', [0.97, 0.5])).toBe(false);
  });

  it('붓 굵기의 1/3 미만 움직임은 무시한다', () => {
    expect(movedEnough([0.5, 0.5], [0.5, 0.5], [4, 10], 0.05)).toBe(false);
    expect(movedEnough([0.5, 0.5], [0.51, 0.5], [4, 10], 0.05)).toBe(true); // 4 cm
  });
});

describe('낙서면 크기', () => {
  it('상자는 6면, 원기둥 3면, 구 1면 (three.js 그룹 순서)', () => {
    expect(faceSizes('box', [1, 2, 3])).toEqual([[3, 2], [3, 2], [1, 3], [1, 3], [1, 2], [1, 2]]);
    expect(faceSizes('cylinder', [1, 2, 1])).toHaveLength(3);
    expect(faceSizes('sphere', [2, 2, 2])).toHaveLength(1);
  });

  it('픽셀 크기는 8 ~ 2048 로 자른다', () => {
    expect(facePixels(0.01, 32)).toBe(8);
    expect(facePixels(100, 128)).toBe(2048);
    expect(facePixels(4, 128)).toBe(512);
  });
});

describe('로비 입장 쿼리 (game-hub 계약 v1)', () => {
  it('hub_return · name · room 을 읽는다', () => {
    const l = parseLobbyLink('?hub_return=http%3A%2F%2Flocalhost%3A5173%2F&name=%EC%B2%A0%EC%88%98&room=r1');
    expect(l).toEqual({ returnUrl: 'http://localhost:5173/', name: '철수', room: 'r1' });
  });

  it('복귀 URL 은 불투명 — 정규화·수정 없이 그대로 돌려준다', () => {
    const raw = 'HTTP://Example.com:80/a/../lobby?door=3&x=%7E#spawn';
    const l = parseLobbyLink(`?room=r1&hub_return=${encodeURIComponent(raw)}`);
    expect(l.returnUrl).toBe(raw);
  });

  it('예전 이름 return 은 읽지 않는다', () => {
    expect(parseLobbyLink('?return=http%3A%2F%2Fx%2F').returnUrl).toBeNull();
  });

  it('http(s) 가 아닌 복귀 주소와 이상한 방 이름은 버린다', () => {
    const l = parseLobbyLink('?hub_return=javascript%3Aalert(1)&room=../x');
    expect(l.returnUrl).toBeNull();
    expect(l.room).toBe('main');
    expect(l.name).toBeNull();
  });
});
