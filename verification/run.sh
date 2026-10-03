#!/usr/bin/env bash
# ============================================================
# Shutterhaus multi-agent self-healing verification loop
#
# Four specialist agents inspect + repair their area:
#   code      -> features, bugs, TypeScript errors, logic
#   css       -> layouts, responsive, iOS Safari, design tokens
#   images    -> gallery sizes, srcset, alt text, broken links
#   backend   -> meta/SEO, PWA, Supabase auth, forms
# A gatekeeper audits all four. ANY defect -> the loop re-runs.
# Stop only after 2 consecutive PASS rounds (one lucky pass
# isn't enough). Default cap 50 rounds so it cannot run forever.
#
# Usage: cd .../shutterhaus-site && ./verification/run.sh [max_rounds]
#   Ctrl+C stops it at the next round boundary.
# ============================================================

set -euo pipefail

HERMES="/c/Users/Operations 3/AppData/Local/hermes/hermes-agent/venv/Scripts/hermes"
BASE="$(cd "$(dirname "$0")/.." && pwd)"
VERIFY="$BASE/verification"

ROLES=("code" "css" "images" "backend")
MAX_ROUNDS="${1:-50}"

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }

init_state() {
  mkdir -p "$VERIFY/prompts" "$VERIFY/round-0"
  cat > "$VERIFY/state" <<EOF
{"round":0,"clean_streak":0,"max_rounds":$MAX_ROUNDS}
EOF
}

# run.sh reads state; the gatekeeper appends to a running defect queue.
init_queue() {
  : > "$VERIFY/fix-queue.md"
}

round_num() { grep -o '"round":[0-9]*' "$VERIFY/state" | grep -o '[0-9]*'; }
clean_streak() { grep -o '"clean_streak":[0-9]*' "$VERIFY/state" | grep -o '[0-9]*'; }
write_state() {
  cat > "$VERIFY/state" <<EOF
{"round":$1,"clean_streak":$2,"max_rounds":$MAX_ROUNDS}
EOF
}

log "Starting self-healing verification loop. Max rounds: $MAX_ROUNDS"

init_state
init_queue

# Lock: only one loop may run at a time. Concurrent loops corrupt the
# shared round-N/ directories (interleaved verdicts, crossed state).
# PID file with a stale check so a SIGKILL'd loop's lock is cleared.
LOCK="$VERIFY/.loop.lock"
if [ -f "$LOCK" ]; then
  OLDPID=$(cat "$LOCK" 2>/dev/null)
  if [ -n "$OLDPID" ] && kill -0 "$OLDPID" 2>/dev/null; then
    log "Another loop is already running (PID $OLDPID). Exiting."
    exit 1
  fi
  rm -f "$LOCK"  # stale lock from a loop that was killed
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

while true; do
  R=$(( $(round_num) + 1 ))
  [ "$R" -ge "$MAX_ROUNDS" ] && { log "STOPPED: round cap reached."; exit 1; }
  ROUND_DIR="$VERIFY/round-$R"
  mkdir -p "$ROUND_DIR"
  : > "$ROUND_DIR/summary.txt"
  : > "$ROUND_DIR/defects.md"
  log "ROUND $R of $MAX_ROUNDS"

  for role in "${ROLES[@]}"; do
    log "  $role checking ..."
    PROMPT="$(sed "s#__REPO__#$BASE#g; s#__ROUND__#$R#g" "$VERIFY/prompts/worker-$role.txt")"
    [ -s "$VERIFY/fix-queue.md" ] && PROMPT="$PROMPT

FIX QUEUE (repair these before passing):
$(cat "$VERIFY/fix-queue.md")"
    # || true: a worker that crashes (non-zero exit) must not kill the
    # loop under set -e. It simply leaves no verdict file -> FAIL -> re-run.
    timeout 1200 "$HERMES" chat -q "$PROMPT" > "$ROUND_DIR/$role.md" 2>&1 || true
    # Primary: the verdict file the agent writes. Fallback: the last
    # PASS/FAIL line in the report (agents sometimes write the report
    # but skip the echo FINAL STEP, leaving no verdict file).
    # tr -d '\015' strips CR only (octal) and keeps newlines intact, so a
    # multi-line report stays multi-line for the grep. Never use tr -d '\r'
    # here: the editor splits that escape across lines, which deletes
    # newlines too and collapses the report into one unmatchable line.
    V=$(cat "$ROUND_DIR/verdict-$role.txt" 2>/dev/null | tr -d '\015' || true)
    if [ -z "$V" ]; then
      V=$(sed 's/\x1b\[[0-9;]*m//g' "$ROUND_DIR/$role.md" 2>/dev/null | tr -d '\015' | grep -E '^(PASS|FAIL)' | tail -1 || true)
    fi
    V="${V#VERDICT: }"
    if echo "$V" | grep -q '^PASS'; then
      log "    $role: PASS"
    elif echo "$V" | grep -q '^FAIL'; then
      echo "VERDICT: $V" >> "$ROUND_DIR/defects.md"
      log "    $role: FAIL"
    else
      log "    $role: no verdict (check $ROUND_DIR/verdict-$role.txt)"
    fi
  done

  log "  gatekeeper auditing ..."
  PROMPT="$(sed "s#__REPO__#$BASE#g; s#__ROUND__#$R#g" "$VERIFY/prompts/gatekeeper.txt")"
  # || true: same resilience as the workers - a crashed gatekeeper
  # leaves no verdict-gatekeeper.txt -> FAIL -> re-run, loop survives.
  timeout 1200 "$HERMES" chat -q "$PROMPT" > "$ROUND_DIR/gatekeeper.md" 2>&1 || true
  GV=$(cat "$ROUND_DIR/verdict-gatekeeper.txt" 2>/dev/null | tr -d '\015' || true)
  if [ -z "$GV" ]; then
    GV=$(sed 's/\x1b\[[0-9;]*m//g' "$ROUND_DIR/gatekeeper.md" 2>/dev/null | tr -d '\015' | grep -E '^(PASS|FAIL)' | tail -1 || true)
  fi
  GV="${GV#VERDICT: }"
  log "  gatekeeper: $GV"
  echo "round $R: $GV" >> "$ROUND_DIR/summary.txt"

  if echo "$GV" | grep -q '^PASS'; then
    S=$(( $(clean_streak) + 1 ))
    log "  clean streak: $S"
    write_state "$R" "$S"
    [ "$S" -ge 2 ] && { log "CONVERGED: 2 consecutive clean rounds. DONE."; exit 0; }
  else
    # append only the compact FAIL verdict lines to the running queue.
    # NEVER append the whole gatekeeper report - it holds the echoed
    # prompt + reasoning (60KB+) and blows the OS arg limit by round 2.
    echo "### round-$R" >> "$ROUND_DIR/defects.md"
    [ -n "$GV" ] && echo "gatekeeper: $GV" >> "$ROUND_DIR/defects.md"
    cat "$ROUND_DIR/defects.md" >> "$VERIFY/fix-queue.md"
    S=0
    write_state "$R" "$S"
    log "  clean streak reset to 0 (defects in queue: $(grep -c '^###' "$VERIFY/fix-queue.md"))"
  fi
done
