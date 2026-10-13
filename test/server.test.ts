import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { parseClientMsg, type Seg, type ServerMsg } from '../shared/protocol.ts';
import { Room } from '../server/room.ts';
import { attachWhiteboard, roomName } from '../server/ws.ts';

const seg = (s: string): Seg => ({ s, a: [0.1, 0.1], b: [0.2, 0.2], c: 0xff0000, w: 0.05 });

function peer() {
  const got: ServerMsg[] = [];
  return { got, send: (m: ServerMsg) => got.push(m) };
}

describe('parseClientMsg', () => {
  it('정상 메시지를 받는다', () => {
    expect(parseClientMsg('{"t":"hello","name":"  철수  "}')).toEqual({ t: 'hello', name: '철수' });
    expect(parseClientMsg(JSON.stringify({ t: 'paint', segs: [seg('pillar:4')] }))).toEqual({
      t: 'paint',
      segs: [seg('pillar:4')],
    });
  });

  it('형식이 틀리면 null', () => {
    expect(parseClientMsg('not json')).toBeNull();
    expect(parseClientMsg('{"t":"paint","segs":[]}')).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'paint', segs: [{ ...seg('x:0'), w: 5 }] }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'paint', segs: [{ ...seg('x:0'), a: [2, 0] }] }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'state', st: { p: [0, 'x', 0], yaw: 0, pitch: 0 } }))).toBeNull();
    expect(parseClientMsg('{"t":"nope"}')).toBeNull();
  });
});

describe('Room', () => {
  it('새 참가자는 본인 포함 명단과 지금까지의 낙서를 받는다', () => {
    const room = new Room();
    const a = peer();
    const ida = room.join(a, 'A');
    room.handle(ida, { t: 'paint', segs: [seg('pillar:4')] });
    const b = peer();
    const idb = room.join(b, 'B');
    const welcome = b.got[0];
    expect(welcome?.t).toBe('welcome');
    if (welcome?.t !== 'welcome') return;
    expect(welcome.id).toBe(idb);
    expect(welcome.players.map((p) => p.id)).toEqual([ida, idb]);
    expect(welcome.history).toEqual([seg('pillar:4')]);
    expect(a.got.at(-1)).toMatchObject({ t: 'join', player: { id: idb, name: 'B' } });
  });

  it('낙서·위치는 보낸 사람을 뺀 모두에게 중계된다', () => {
    const room = new Room();
    const a = peer();
    const b = peer();
    const ida = room.join(a, 'A');
    room.join(b, 'B');
    const before = a.got.length;
    room.handle(ida, { t: 'paint', segs: [seg('floor:2')] });
    room.handle(ida, { t: 'state', st: { p: [1, 0, 1], yaw: 0, pitch: 0 } });
    expect(a.got.length).toBe(before);
    expect(b.got.slice(-2).map((m) => m.t)).toEqual(['paint', 'state']);
  });

  it('나간 참가자의 아바타 낙서는 기록에서 사라진다', () => {
    const room = new Room();
    const a = peer();
    const b = peer();
    const ida = room.join(a, 'A');
    const idb = room.join(b, 'B');
    room.handle(ida, { t: 'paint', segs: [seg(`p:${idb}:head:5`), seg('pillar:0')] });
    room.leave(idb);
    expect(room.historyLength).toBe(1);
    expect(a.got.at(-1)).toEqual({ t: 'leave', id: idb });
  });

  it('기록이 상한을 넘으면 오래된 것부터 버린다', () => {
    const room = new Room(100);
    const id = room.join(peer(), 'A');
    for (let i = 0; i < 101; i++) room.handle(id, { t: 'paint', segs: [seg('pillar:0')] });
    expect(room.historyLength).toBe(90);
  });

  it('방 이름은 영숫자·-·_ 만', () => {
    expect(roomName('/ws?room=team-1')).toBe('team-1');
    expect(roomName('/ws?room=../../x')).toBe('main');
    expect(roomName('/ws')).toBe('main');
  });
});

describe('웹소켓 서버 (실제 연결)', () => {
  let server: Server | null = null;
  afterEach(() => {
    server?.closeAllConnections();
    server?.close();
    server = null;
  });

  function client(url: string) {
    const ws = new WebSocket(url);
    const got: ServerMsg[] = [];
    const waiters: (() => void)[] = [];
    ws.on('message', (d) => {
      got.push(JSON.parse(d.toString()) as ServerMsg);
      waiters.splice(0).forEach((w) => w());
    });
    const until = async (pred: () => boolean) => {
      while (!pred()) await new Promise<void>((r) => waiters.push(r));
    };
    const opened = new Promise<void>((r) => ws.on('open', () => r()));
    return { ws, got, until, opened };
  }

  it('두 참가자가 낙서를 주고받고, 나가면 leave 가 온다', async () => {
    server = createServer();
    attachWhiteboard(server);
    await new Promise<void>((r) => server!.listen(0, r));
    const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws?room=t`;

    const a = client(url);
    await a.opened;
    a.ws.send(JSON.stringify({ t: 'hello', name: 'A' }));
    await a.until(() => a.got.some((m) => m.t === 'welcome'));

    const b = client(url);
    await b.opened;
    b.ws.send(JSON.stringify({ t: 'hello', name: 'B' }));
    await a.until(() => a.got.some((m) => m.t === 'join'));

    b.ws.send(JSON.stringify({ t: 'paint', segs: [seg('pillar:4')] }));
    await a.until(() => a.got.some((m) => m.t === 'paint'));
    expect(a.got.find((m) => m.t === 'paint')).toEqual({ t: 'paint', segs: [seg('pillar:4')] });

    b.ws.close();
    await a.until(() => a.got.some((m) => m.t === 'leave'));
    a.ws.close();
  });
});
