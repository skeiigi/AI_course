#!/usr/bin/env bash
# Smoke-test для хуков. Не требует git-репозитория.
#   1) detect_workspaces:   даём ему искусственные staged-файлы, проверяем выбор
#   2) commit-msg:          прогоняем хорошие и плохие сообщения
#   3) manifest_changed:    единица измерения для post-merge/post-checkout
#   4) post-merge быстрые:  merge-флаг и HOOK_SKIP_INSTALL
#
# Запуск: bash hooks/smoke-test.sh

set -euo pipefail

HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"

# Подменяем git, чтобы detect_workspaces увидел наши staged-файлы.
git() {
  if [[ "$1" == "diff" && "$2" == "--cached" ]]; then
    printf '%s\n' "${__STAGED__:-}"
    return 0
  fi
  command git "$@"
}
export -f git

# подгружаем хелперы
. "$HOOKS_DIR/shared/git-helpers.sh"

assert_eq() {
  local got="$1" want="$2" label="$3"
  if [[ "$got" != "$want" ]]; then
    printf 'FAIL: %s\n  want: %q\n  got:  %q\n' "$label" "$want" "$got" >&2
    exit 1
  fi
  printf '  ok: %s\n' "$label"
}

echo "== detect_workspaces =="

# 1) только server
__STAGED__="server/src/foo.ts
server/test/foo.test.ts"
out=$(detect_workspaces | tr '\n' ' ')
assert_eq "$out" "server " "только server"

# 2) web + contract
__STAGED__="web/src/App.tsx
contract/main.tsp"
out=$(detect_workspaces | tr '\n' ' ')
assert_eq "$out" "contract web " "web+contract"

# 3) корневой package.json + что-то ещё → должен притянуть contract
__STAGED__="package.json
server/src/x.ts"
out=$(detect_workspaces | tr '\n' ' ')
assert_eq "$out" "contract server " "package.json => contract"

# 4) только README — гоняем всё.
# detect_workspaces сортирует результат: contract < e2e < server < web
__STAGED__="README.md
hooks/README.md"
out=$(detect_workspaces | tr '\n' ' ')
assert_eq "$out" "contract e2e server web " "только README => всё"

# 5) пусто
__STAGED__=""
out=$(detect_workspaces | tr '\n' ' ')
assert_eq "$out" "contract e2e server web " "пусто => всё"

echo
echo "== commit-msg =="

write_msg() { printf '%s' "$1" > "$1.tmp" || true; }

run_commit_msg() {
  local msg="$1"
  local f
  f="$(mktemp)"
  printf '%s' "$msg" > "$f"
  if "$HOOKS_DIR/commit-msg" "$f" >/dev/null 2>&1; then
    printf '  ok: %s\n' "${msg:0:60}"
  else
    printf '  REJECTED (as expected): %s\n' "${msg:0:60}"
  fi
  rm -f "$f"
}

run_commit_msg "feat(server): add /bookings endpoint"
run_commit_msg "fix(web): prevent double submit"
run_commit_msg "docs(contract): regenerate openapi"
run_commit_msg "refactor!: drop v1 routes"
run_commit_msg "chore: bump deps"
run_commit_msg "bad message"               # ожидаем REJECTED
run_commit_msg "Update stuff"              # ожидаем REJECTED
run_commit_msg "Merge branch 'main' into dev" # служебное, должно пройти

echo
echo "== manifest_changed (используется post-merge и post-checkout) =="

# Тестируем функцию из git-helpers.sh, которая в текущем процессе уже загружена.

assert_manifest() {
  local label="$1"
  local want="$2"
  shift 2
  if manifest_changed "$@"; then got=yes; else got=no; fi
  if [[ "$got" == "$want" ]]; then
    printf '  ok: %s -> %s\n' "$label" "$got"
  else
    printf '  FAIL: %s ожидал %s, получил %s (аргументы: %s)\n' \
      "$label" "$want" "$got" "$*" >&2
    exit 1
  fi
}

assert_manifest "только package.json"      yes package.json
assert_manifest "package-lock.json"        yes package-lock.json
assert_manifest "yarn.lock"                yes yarn.lock
assert_manifest "pnpm-lock.yaml"           yes pnpm-lock.yaml
assert_manifest "bun.lockb"                yes bun.lockb
assert_manifest "вложенный package.json"   yes "server/package.json"
assert_manifest "только README"            no  README.md
assert_manifest "только .ts"               no  server/src/foo.ts
assert_manifest "несколько + манифест"     yes package.json server/src/x.ts
assert_manifest "через stdin"              yes <<<'package.json'
assert_manifest "stdin без манифеста"      no  <<<'README.md'

echo
echo "== post-merge (быстрые пути) =="

# merge=0 — никакого вывода, никаких ошибок
out=$("$HOOKS_DIR/post-merge" 0 2>&1 || true)
if [[ -z "$out" ]]; then
  printf '  ok: post-merge без merge-флага — тишина\n'
else
  printf '  FAIL: ожидал пустой вывод, был: %s\n' "$out" >&2
  exit 1
fi

# merge=1 + HOOK_SKIP_INSTALL=1 — должен почтить флаг и сразу выйти
out=$(HOOK_SKIP_INSTALL=1 "$HOOKS_DIR/post-merge" 1 2>&1 || true)
if [[ "$out" == *"HOOK_SKIP_INSTALL=1"* ]]; then
  printf '  ok: post-merge уважает HOOK_SKIP_INSTALL\n'
else
  printf '  FAIL: ожидал сообщение про SKIP, было: %s\n' "$out" >&2
  exit 1
fi

echo
echo "ALL TESTS PASSED"