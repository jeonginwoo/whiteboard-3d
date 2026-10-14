# whiteboard-3d — a multiplayer 3D whiteboard: doodle on a central pillar, the props, and each other

<!-- Admission test for every line in this file — keep a line only if all three hold:
     (1) always true  (2) needed every session  (3) not derivable from the code.
     Fails one → delete it or move it under docs/. State rules as must/never, not "is".
     No empty sections, no speculative parts: a section appears when its pain is felt. -->

Browser game on Three.js + Vite + TypeScript, with a Node + `ws` relay server. It is one of the games
opened from the `game-hub` lobby (`C:\Projects\playground\game-hub`) — reached by URL only, never imported.

## Session start

Read `docs/PROGRESS.md` first — current state, decision log, work queue, next task.

## Commands

```bash
bash scripts/verify.sh            # full verification (--quick: fast tier)
                                  # full log → build/last-verify.log; on FAIL read only the failing part
bash scripts/ralph.sh 2           # autonomous queue loop — only with a human watching
npm run dev                       # dev server + /ws relay in one process (http://localhost:5174)
npm run build && npm start        # production: dist/ + /ws on one port (PORT, default 8787)
bash scripts/shot.sh "/?demo"     # look at it: headless screenshot → build/shot/whiteboard.png
```

## Structure rules (invariants — never write code that violates them)

1. `shared/` is pure logic (world layout, physics, protocol) — it never imports `three`, the DOM, or `node:*`.
   Client and server both import it; gameplay rules that must be tested live there or in `client/*-math.ts`.
2. Every doodle is a `Seg` on a surface id `"<object key>:<face index>"` — local strokes, network relay, and
   join-time history all go through `SurfaceRegistry.apply`. Never draw on a surface canvas any other way,
   or late joiners will see a different picture.
3. The server is a relay: it validates with `parseClientMsg`, keeps the roster and the doodle history,
   and never simulates movement (client-authoritative, as in game-hub).
4. The lobby contract is game-hub `docs/game-entry-contract.md` (v3) and lives here in `client/lobby-link.ts` only:
   leave by navigating to `hub_return` exactly as given (opaque — never parse, rebuild, or append to it).
   `hub_name` / `hub_room` are untrusted hints (display name, room name) — the server re-validates both.
   Never use the `hub_` prefix for this game's own params, and never import game-hub code.

## Way of working

- One task = one session = one commit. Keep the unit small enough to review in one diff.
- Never claim a task done unless `bash scripts/verify.sh` passes. On FAIL, read only
  the failing part of `build/last-verify.log` (grep/tail) — never the whole log.
- Say what you could NOT verify (feel of controls, live multi-browser play) instead of implying it works.
  Headless screenshots cannot send keys or pointer lock — `?demo` (DEV only) is the visual check.
- Work discovered mid-task goes to 후보 일감 in `docs/PROGRESS.md` — never done silently.
- Decisions that change or contradict a document go to the PROGRESS decision log with 근거,
  and the contradicted document is fixed in the same session.
- Harness parts are added only when their pain is felt — no empty sections, no speculative parts.
  A harness rule change is its own `chore:` commit, landed before the work that needs it.
- The `reviewer` agent never runs on the author's model — its `model:` stays pinned to a
  different family (blind-spot separation; `scripts/verify.sh` checks it).
- Language: instruction files (this file, commands, agents, scripts) in English;
  records (`docs/`) and code comments in Korean.
- Commit message: `type: 한국어 요약` (+ `- ` bullet lines). Types: `feat` `fix` `refactor` `test` `docs` `chore`.
