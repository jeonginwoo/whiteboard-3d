// game-hub 로비와의 입장 계약 v3 (game-hub `docs/game-entry-contract.md`).
// 로비는 이 페이지 URL 에 hub_ 파라미터를 붙여 이동시키고, 게임은 나갈 때 hub_return 으로 그대로 이동한다.
//   ?hub_return=<복귀 URL>  불투명한 값 — 해석·수정 없이 그대로 쓴다. http(s) 가 아니면 무시(계약 MAY)
//   ?hub_name=<이름>        (v2) 이름 칸을 미리 채운다. 표시용 힌트일 뿐 — 서버가 cleanName 으로 다시 거른다
//   ?hub_room=<방 코드>     (v3) 같은 로비 방에서 온 사람끼리 같은 화이트보드. 서버 roomName 이 다시 거른다
// 아래는 이 게임 자체 파라미터다 (게임 단독 실행용). hub_ 값이 있으면 그쪽이 먼저다.
// hub_ 접두어는 로비 예약이라 자기 파라미터에 쓰지 않는다.
//   ?name=<표시 이름>   있으면 이름 칸을 미리 채운다
//   ?room=<방 이름>     같은 방끼리 같은 화이트보드 (없으면 main)

export interface LobbyLink {
  returnUrl: string | null;
  name: string | null;
  room: string;
}

/** 서버 `roomName` 과 같은 규칙 — 영숫자·-·_ 1~32자 */
const ROOM_RE = /^[\w-]{1,32}$/;

export function parseLobbyLink(search: string): LobbyLink {
  const q = new URLSearchParams(search);
  const ret = q.get('hub_return');
  const room = [q.get('hub_room'), q.get('room')].find((r) => r && ROOM_RE.test(r));
  return {
    returnUrl: ret && /^https?:/i.test(ret) ? ret : null,
    name: q.get('hub_name')?.trim() || q.get('name')?.trim() || null,
    room: room ?? 'main',
  };
}
