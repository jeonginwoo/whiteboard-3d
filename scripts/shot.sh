#!/usr/bin/env bash
# Look at the game: start the dev server if it is not already up, capture one frame with
# headless Chrome, print the page's console lines, and stop the server only if this script
# started it. This is the project's "run the app and see it" step (CLAUDE.md Commands).
# Usage: bash scripts/shot.sh [path]      e.g.  bash scripts/shot.sh "/?room=test"
# Output: build/shot/whiteboard.png (Read it and look), build/shot/chrome.log, build/shot/dev.log
# Exit: non-zero if Chrome failed or the page logged a console error.
set -u

PAGE="${1:-/}"
URL="http://localhost:5174${PAGE}"
OUT=build/shot
mkdir -p "$OUT/profile"

CHROME=""
for c in "/c/Program Files/Google/Chrome/Application/chrome.exe" \
         "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
         "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
         "/c/Program Files/Microsoft/Edge/Application/msedge.exe"; do
  [ -f "$c" ] && { CHROME="$c"; break; }
done
[ -n "$CHROME" ] || { echo "no Chrome/Edge found — install one or edit scripts/shot.sh"; exit 1; }

listening() { netstat -ano 2>/dev/null | grep -qE ':5174[[:space:]].*LISTENING'; }
stop_server() {
  local p
  for p in $(netstat -ano | grep -E ':5174[[:space:]].*LISTENING' | awk '{print $NF}' | sort -u); do
    taskkill //F //PID "$p" >/dev/null 2>&1 || true
  done
}

started=0
if ! listening; then
  ( npm run dev >"$OUT/dev.log" 2>&1 & )
  started=1
  if ! timeout 40 bash -c 'until curl -sf http://localhost:5174/ >/dev/null 2>&1; do sleep 1; done'; then
    echo "dev server did not come up within 40s — see $OUT/dev.log"
    stop_server
    exit 1
  fi
fi

# --user-data-dir: without it headless Chrome hands the URL to an already running Chrome and
#   exits with no screenshot.  --virtual-time-budget: lets requestAnimationFrame run a few
#   frames before capture, otherwise the canvas can still be empty.  WebGL runs on SwiftShader
#   (software) here — this proves the scene draws, not how fast.
"$CHROME" --headless=new --no-first-run --no-default-browser-check --hide-scrollbars \
  --user-data-dir="$(cygpath -w "$PWD/$OUT/profile")" \
  --window-size=1280,800 --virtual-time-budget=4000 \
  --enable-logging=stderr --v=0 \
  --screenshot="$(cygpath -w "$PWD/$OUT/whiteboard.png")" \
  "$URL" >"$OUT/chrome.log" 2>&1
rc=$?

echo "url:        $URL"
if [ $started -eq 1 ]; then echo "server:     started by this script, stopped at the end"; else echo "server:     already running — reused, left running"; fi
echo "screenshot: $OUT/whiteboard.png  (chrome exit $rc)"
echo "console:"
if grep -q 'CONSOLE' "$OUT/chrome.log"; then
  grep 'CONSOLE' "$OUT/chrome.log" | sed -E 's/^\[[^]]*:([A-Z]+):CONSOLE:[0-9]+\] /  \1  /'
else
  echo "  (none)"
fi
if grep -q 'ERROR:CONSOLE' "$OUT/chrome.log"; then
  echo "page logged a console error — see $OUT/chrome.log"
  rc=1
fi

[ $started -eq 1 ] && stop_server
exit $rc
