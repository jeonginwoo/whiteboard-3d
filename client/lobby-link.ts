// game-hub 로비와의 입장 계약 v1 (game-hub `docs/game-entry-contract.md`).
// 로비는 이 페이지 URL 에 hub_return 을 붙여 이동시키고, 게임은 나갈 때 그 값으로 그대로 이동한다.
//   ?hub_return=<복귀 URL>  불투명한 값 — 해석·수정 없이 그대로 쓴다. http(s) 가 아니면 무시(계약 MAY)
// 아래는 이 게임 자체 파라미터다 (계약 v1 은 플레이어 정보를 넘기지 않으므로 로비는 보내지 않는다).
// hub_ 접두어는 로비 예약이라 쓰지 않는다.
//   ?name=<표시 이름>   있으면 이름 칸을 미리 채운다
//   ?room=<방 이름>     같은 방끼리 같은 화이트보드 (없으면 main)

export interface LobbyLink {
  returnUrl: string | null;
  name: string | null;
  room: string;
}

export function parseLobbyLink(search: string): LobbyLink {
  const q = new URLSearchParams(search);
  const ret = q.get('hub_return');
  const room = q.get('room') ?? '';
  return {
    returnUrl: ret && /^https?:/i.test(ret) ? ret : null,
    name: q.get('name')?.trim() || null,
    room: /^[\w-]{1,32}$/.test(room) ? room : 'main',
  };
}
