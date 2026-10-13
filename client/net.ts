// 서버 연결 — 같은 호스트의 /ws. 연결이 안 돼도 혼자 그리기는 계속된다.
import type { ClientMsg, PlayerState, Seg, ServerMsg } from '../shared/protocol.ts';
import { LIMITS } from '../shared/protocol.ts';

const STATE_MS = 66; // 위치 전송 간격 (~15 Hz)
const PAINT_MS = 50; // 낙서 묶음 전송 간격

export class Net {
  private readonly ws: WebSocket;
  private paintQueue: Seg[] = [];
  private lastState = 0;
  private lastPaint = 0;
  private stateKey = '';

  constructor(room: string, name: string, onMsg: (m: ServerMsg) => void, onClose: () => void) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(room)}`);
    this.ws.addEventListener('open', () => this.send({ t: 'hello', name }));
    this.ws.addEventListener('message', (e) => onMsg(JSON.parse(e.data as string) as ServerMsg));
    this.ws.addEventListener('close', onClose);
  }

  get open(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  queuePaint(seg: Seg): void {
    this.paintQueue.push(seg);
  }

  /** 루프에서 매 프레임 호출 — 간격이 찼을 때만 실제로 보낸다 */
  tick(now: number, st: PlayerState): void {
    if (!this.open) return;
    if (now - this.lastState >= STATE_MS) {
      const key = `${st.p.map((v) => v.toFixed(2)).join()},${st.yaw.toFixed(2)},${st.pitch.toFixed(2)}`;
      if (key !== this.stateKey) {
        this.send({ t: 'state', st });
        this.stateKey = key;
      }
      this.lastState = now;
    }
    if (this.paintQueue.length && now - this.lastPaint >= PAINT_MS) {
      while (this.paintQueue.length) this.send({ t: 'paint', segs: this.paintQueue.splice(0, LIMITS.segsPerMsg) });
      this.lastPaint = now;
    }
  }

  private send(msg: ClientMsg): void {
    if (this.open) this.ws.send(JSON.stringify(msg));
  }
}
