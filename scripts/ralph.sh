#!/usr/bin/env bash
# Ralph loop: work the PROGRESS 작업 큐, ONE item per FRESH session.
# Fresh context per iteration avoids context rot; state lives in PROGRESS.md.
# Usage: bash scripts/ralph.sh [max_iterations]   (default 2)
# Guards: exits when the queue is empty, stops on first failure, capped iterations.
# Run only while a human is watching the output.
set -u

MAX="${1:-2}"

for i in $(seq 1 "$MAX"); do
  if ! grep -q '^- \[ \]' docs/PROGRESS.md; then
    echo "[ralph] queue is empty — done."
    exit 0
  fi
  echo "[ralph] iteration $i/$MAX — fresh session takes the next queue item"
  claude -p "/next --loop" --permission-mode acceptEdits \
    || { echo "[ralph] session failed — stopping."; exit 1; }
  bash scripts/verify.sh --quick \
    || { echo "[ralph] regression after iteration $i — stopping."; exit 1; }
done
echo "[ralph] reached max iterations ($MAX). Queue may still have items."
