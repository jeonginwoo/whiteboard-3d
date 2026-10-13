---
description: End a session — verify, review, record, commit
---

End the current session.

1. Run `bash scripts/verify.sh`. If it fails, fix it first — never wrap up red.
2. For a non-trivial diff, run the `reviewer` agent and resolve BLOCKER/MAJOR findings.
3. Update `docs/PROGRESS.md`:
   - 현재 상태 (진행 위치 · 다음 작업 · 차단 요소)
   - 세션 로그 entry (use the 형식 template, newest on top) — say what was NOT verified
   - any new decisions → 결정 기록, always with 근거
   - follow-up work discovered → 후보 일감
4. If `CLAUDE.md` drifted from reality during this session, fix it now.
5. Commit in the format from CLAUDE.md. Never end a session with uncommitted work.
