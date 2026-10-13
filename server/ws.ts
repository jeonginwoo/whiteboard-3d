// HTTP 서버에 /ws 웹소켓을 붙인다. 개발(Vite 플러그인)과 배포(server/main.ts)가 같은 함수를 쓴다.
// 첫 메시지는 반드시 hello — 그 전에는 방에 들어가지 않는다.
import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientMsg, type ServerMsg } from '../shared/protocol.ts';
import { Room } from './room.ts';

const HEARTBEAT_MS = 30_000;

/** ?room=<이름> — 영숫자·-·_ 만, 없으면 main */
export function roomName(url: string | undefined): string {
  const q = new URL(url ?? '/', 'http://x').searchParams.get('room') ?? '';
  return /^[\w-]{1,32}$/.test(q) ? q : 'main';
}

export function attachWhiteboard(server: Server, rooms = new Map<string, Room>()): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    // 다른 업그레이드(예: Vite HMR)는 건드리지 않는다
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws') return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket & { alive?: boolean }, req: { url?: string }) => {
    const name = roomName(req.url);
    let room = rooms.get(name);
    if (!room) {
      room = new Room();
      rooms.set(name, room);
    }
    let id: string | null = null;
    ws.alive = true;
    ws.on('pong', () => (ws.alive = true));

    const peer = {
      send(msg: ServerMsg) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
    };

    ws.on('message', (data) => {
      const msg = parseClientMsg(data.toString());
      if (!msg) return;
      if (id === null) {
        if (msg.t === 'hello') id = room.join(peer, msg.name);
        return;
      }
      room.handle(id, msg);
    });

    ws.on('close', () => {
      if (id !== null) room.leave(id);
    });
  });

  const beat = setInterval(() => {
    for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  beat.unref();
  wss.on('close', () => clearInterval(beat));

  return wss;
}
