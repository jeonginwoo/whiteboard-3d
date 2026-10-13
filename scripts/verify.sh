#!/usr/bin/env bash
# Full verification in one command.
# Full logs are offloaded to build/last-verify.log — the console prints only
# PASS/FAIL/WARN per step, so verification output never floods the context window.
# Usage: bash scripts/verify.sh [--quick]   (--quick: fast tier, for loops and the Stop hook)
set -u

QUICK="${1:-}"
LOG="build/last-verify.log"
mkdir -p build
: > "$LOG"

fail=0

step() {                 # a red step fails the run
  local name="$1"; shift
  echo "== $name ==" >> "$LOG"
  if "$@" >> "$LOG" 2>&1; then
    echo "PASS  $name"
  else
    echo "FAIL  $name  (see $LOG)"
    fail=1
  fi
}

soft_step() {            # reports, never fails the run (ratchets, budgets)
  local name="$1"; shift
  echo "== $name ==" >> "$LOG"
  if "$@" >> "$LOG" 2>&1; then
    echo "PASS  $name"
  else
    echo "WARN  $name  (see $LOG)"
  fi
}

# --- harness checks (keep) ----------------------------------------------------

check_docs() {
  # The harness documents must exist and must not carry unfilled template markers.
  local bad=0 f
  for f in CLAUDE.md docs/PROGRESS.md; do
    [ -f "$f" ] || { echo "missing required doc: $f"; bad=1; }
  done
  if grep -rl '{{[A-Z_]*}}' CLAUDE.md docs .claude scripts 2>/dev/null | grep -q .; then
    echo "unfilled template placeholder ({{...}}) in:"
    grep -rl '{{[A-Z_]*}}' CLAUDE.md docs .claude scripts 2>/dev/null
    bad=1
  fi
  [ $bad -eq 0 ] && echo "harness docs present, no placeholders left"
  return $bad
}

check_script_eol() {
  # Shell scripts must be LF in the working copy — bash chokes on a trailing CR.
  # Editors and scripted rewrites reintroduce CRLF silently, so .gitattributes alone
  # is not enough. Counted with tr: grep/awk read text mode under Git Bash and swallow the CR.
  local bad=0 f n
  while IFS= read -r f; do
    n=$(tr -dc '\r' < "$f" | wc -c)
    if [ "$n" -gt 0 ]; then
      echo "CRLF in $f ($n carriage returns) — shell scripts must be LF"
      bad=1
    fi
  done < <(find scripts -name '*.sh' 2>/dev/null | sort)
  [ $bad -eq 0 ] && echo "all scripts are LF"
  return $bad
}

check_reviewer_model() {
  # The reviewer never runs on the author's model (blind-spot separation): the same model
  # writing and judging misses the same things. Mechanical part: reviewer.md pins a model,
  # and its family differs from the session model when settings.json pins one.
  # (A model switched at runtime with /model is invisible here — that is the rule's limit.)
  local f=.claude/agents/reviewer.md rmodel smodel rfam sfam
  [ -f "$f" ] || { echo "missing $f"; return 1; }
  rmodel=$(tr -d '\r' < "$f" | awk 'NR==1{next} /^---$/{exit} /^model:/{sub(/^model:[ \t]*/,""); print; exit}')
  if [ -z "$rmodel" ] || [ "$rmodel" = inherit ]; then
    echo "reviewer.md must pin a model different from the author's (model: <alias>) — found '${rmodel:-none}'"
    return 1
  fi
  smodel=$(grep -oE '"model"[[:space:]]*:[[:space:]]*"[^"]+"' .claude/settings.json 2>/dev/null | sed -E 's/.*"([^"]+)"$/\1/')
  rfam=$(grep -oE 'opus|sonnet|haiku|fable' <<<"$rmodel" | head -1)
  sfam=$(grep -oE 'opus|sonnet|haiku|fable' <<<"$smodel" | head -1)
  if [ -n "$sfam" ] && [ "$sfam" = "$rfam" ]; then
    echo "reviewer model '$rmodel' is the same family as the session model '$smodel' — pick a different one"
    return 1
  fi
  echo "reviewer runs on '$rmodel'${smodel:+ (session: $smodel)}"
  return 0
}

# --- run ----------------------------------------------------------------------

step "docs" check_docs
step "reviewer model" check_reviewer_model
step "script line endings" check_script_eol

# Project stages — register them in the session that first needs them, never ahead
# of it (CLAUDE.md: no speculative parts).
step "typecheck" npm run --silent typecheck
if [ "$QUICK" != "--quick" ]; then
  step "unit tests" npm run --silent test
  step "build"      npm run --silent build
fi

exit $fail
