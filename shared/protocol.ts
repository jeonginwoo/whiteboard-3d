// 클라이언트 ↔ 서버 메시지 (JSON over WebSocket). 서버는 받은 메시지를 parseClientMsg 로만 해석한다.
import type { Vec3 } from './world.ts';

/**
 * 낙서 한 토막 — 낙서면 s 위의 UV 점 a → b 직선.
 * s = "<물체 키>:<면 번호>" (예: "pillar:4", 아바타는 "p:<플레이어 id>:body:5").
 * w 는 붓 굵기(m) — 면마다 해상도가 달라도 같은 굵기로 보이게. e = 지우개.
 */
export interface Seg {
  s: string;
  a: [number, number];
  b: [number, number];
  c: number;
  w: number;
  e?: 1;
}

export interface PlayerState {
  p: Vec3;
  yaw: number;
  pitch: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
  color: number;
  state: PlayerState | null;
}

export type ClientMsg =
  | { t: 'hello'; name: string }
  | { t: 'state'; st: PlayerState }
  | { t: 'paint'; segs: Seg[] };

export type ServerMsg =
  | { t: 'welcome'; id: string; players: PlayerInfo[]; history: Seg[] } // players 에 본인 포함
  | { t: 'join'; player: PlayerInfo }
  | { t: 'leave'; id: string }
  | { t: 'state'; id: string; st: PlayerState }
  | { t: 'paint'; segs: Seg[] };

export const LIMITS = {
  name: 16,
  surfaceId: 64,
  segsPerMsg: 256,
  minWidth: 0.005,
  maxWidth: 1,
};

/** 아바타 낙서면 키 접두어 — 플레이어가 나가면 서버가 이 접두어의 낙서를 버린다 */
export function avatarPrefix(playerId: string): string {
  return `p:${playerId}:`;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isUv(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && v.every((x) => isNum(x) && x >= -0.01 && x <= 1.01);
}

function parseSeg(v: unknown): Seg | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.s !== 'string' || o.s.length === 0 || o.s.length > LIMITS.surfaceId) return null;
  if (!isUv(o.a) || !isUv(o.b)) return null;
  if (!isNum(o.c) || !Number.isInteger(o.c) || o.c < 0 || o.c > 0xffffff) return null;
  if (!isNum(o.w) || o.w < LIMITS.minWidth || o.w > LIMITS.maxWidth) return null;
  const seg: Seg = { s: o.s, a: [o.a[0], o.a[1]], b: [o.b[0], o.b[1]], c: o.c, w: o.w };
  if (o.e === 1) seg.e = 1;
  return seg;
}

function parseState(v: unknown): PlayerState | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const p = o.p;
  if (!Array.isArray(p) || p.length !== 3 || !p.every(isNum)) return null;
  if (!isNum(o.yaw) || !isNum(o.pitch)) return null;
  return { p: [p[0], p[1], p[2]] as [number, number, number], yaw: o.yaw, pitch: o.pitch };
}

export function cleanName(raw: string): string {
  const name = raw.replace(/[\u0000-\u001f]/g, '').trim().slice(0, LIMITS.name);
  return name || '손님';
}

/** 형식이 틀리면 null — 서버는 그 메시지를 조용히 버린다 */
export function parseClientMsg(raw: string): ClientMsg | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  switch (o.t) {
    case 'hello':
      return typeof o.name === 'string' ? { t: 'hello', name: cleanName(o.name) } : null;
    case 'state': {
      const st = parseState(o.st);
      return st ? { t: 'state', st } : null;
    }
    case 'paint': {
      if (!Array.isArray(o.segs) || o.segs.length === 0 || o.segs.length > LIMITS.segsPerMsg) return null;
      const segs: Seg[] = [];
      for (const s of o.segs) {
        const seg = parseSeg(s);
        if (!seg) return null;
        segs.push(seg);
      }
      return { t: 'paint', segs };
    }
    default:
      return null;
  }
}
