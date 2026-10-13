// 방 하나 — 참가자 명단과 낙서 기록. 전송(ws)과 분리해 단위 테스트로 검사한다.
// 위치는 클라이언트 권위: 서버는 명단 관리·중계·낙서 기록 보관만 한다.
import { avatarPrefix, type ClientMsg, type PlayerInfo, type Seg, type ServerMsg } from '../shared/protocol.ts';

export interface Peer {
  send(msg: ServerMsg): void;
}

const AVATAR_COLORS = [0x5e81ac, 0xbf616a, 0xa3be8c, 0xb48ead, 0xd08770, 0x88c0d0, 0xebcb8b, 0x8fbcbb];

export class Room {
  readonly maxHistory: number;
  private readonly players = new Map<string, { info: PlayerInfo; peer: Peer }>();
  private history: Seg[] = [];
  private nextId = 1;

  constructor(maxHistory = 100_000) {
    this.maxHistory = maxHistory;
  }

  get size(): number {
    return this.players.size;
  }

  get historyLength(): number {
    return this.history.length;
  }

  /** 새 참가자 — 본인에게 welcome(본인 포함 명단 + 지금까지의 낙서), 나머지에게 join */
  join(peer: Peer, name: string): string {
    const n = this.nextId++;
    const id = `u${n}`;
    const info: PlayerInfo = { id, name, color: AVATAR_COLORS[(n - 1) % AVATAR_COLORS.length]!, state: null };
    const players = [...[...this.players.values()].map((p) => p.info), info];
    peer.send({ t: 'welcome', id, players, history: this.history });
    this.broadcast({ t: 'join', player: info });
    this.players.set(id, { info, peer });
    return id;
  }

  /** 나간 참가자의 아바타 낙서는 더 그릴 곳이 없으므로 기록에서 버린다 */
  leave(id: string): void {
    if (!this.players.delete(id)) return;
    const prefix = avatarPrefix(id);
    this.history = this.history.filter((s) => !s.s.startsWith(prefix));
    this.broadcast({ t: 'leave', id });
  }

  handle(id: string, msg: ClientMsg): void {
    const me = this.players.get(id);
    if (!me) return;
    if (msg.t === 'state') {
      me.info.state = msg.st;
      this.broadcast({ t: 'state', id, st: msg.st }, id);
    } else if (msg.t === 'paint') {
      this.history.push(...msg.segs);
      if (this.history.length > this.maxHistory) {
        // 가장 오래된 낙서부터 버린다 — 새로 들어온 사람에게는 그만큼 덜 보인다
        this.history = this.history.slice(this.history.length - Math.floor(this.maxHistory * 0.9));
      }
      this.broadcast({ t: 'paint', segs: msg.segs }, id);
    }
  }

  private broadcast(msg: ServerMsg, except?: string): void {
    for (const [pid, p] of this.players) {
      if (pid !== except) p.peer.send(msg);
    }
  }
}
