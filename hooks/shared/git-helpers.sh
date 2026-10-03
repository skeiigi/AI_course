# shellcheck shell=bash
# Общие утилиты для git-хуков монорепо booking-reference.
# Подключается через:
#   . "$(dirname "$0")/shared/git-helpers.sh"
# из pre-commit / commit-msg / pre-push.

# Защита от двойной загрузки
if [[ -n "${__GH_LOADED:-}" ]]; then
  return 0 2>/dev/null || true
fi
__GH_LOADED=1

# Цвета (если терминал поддерживает)
if [[ -t 1 ]]; then
  __C_RED=$'\033[31m'
  __C_GREEN=$'\033[32m'
  __C_YELLOW=$'\033[33m'
  __C_BLUE=$'\033[34m'
  __C_BOLD=$'\033[1m'
  __C_RESET=$'\033[0m'
else
  __C_RED=''; __C_GREEN=''; __C_YELLOW=''; __C_BLUE=''; __C_BOLD=''; __C_RESET=''
fi

log_info()    { printf '%s[hook]%s %s\n' "$__C_BLUE"   "$__C_RESET" "$*"; }
log_ok()      { printf '%s[hook]%s %s\n' "$__C_GREEN"  "$__C_RESET" "$*"; }
log_warn()    { printf '%s[hook]%s %s\n' "$__C_YELLOW" "$__C_RESET" "$*" >&2; }
log_error()   { printf '%s[hook]%s %s\n' "$__C_RED"    "$__C_RESET" "$*" >&2; }
log_section() { printf '\n%b%s▶ %s%s\n' "$__C_BOLD" "$__C_BLUE" "$*" "$__C_RESET"; }

# Фейл с понятным сообщением (не 0 = git прервёт коммит/пуш)
fail() {
  log_error "$*"
  exit 1
}

# Staged-файлы относительно корня репозитория, один на строку
staged_files() {
  git diff --cached --name-only --diff-filter=ACMR
}

# Staged-файлы, чьи пути попадают в префикс (например "server/")
staged_files_in() {
  local prefix="$1"
  staged_files | grep -E "^${prefix}" || true
}

# Какие workspace из booking-reference затронуты staged-файлами.
# Печатает server / web / contract / e2e по одному на строку.
# Если staged пусто (merge commit, amend) — печатает все.
detect_workspaces() {
  local files
  files=$(staged_files)

  local touched=()

  if [[ -z "$files" ]]; then
    touched=(server web contract e2e)
  else
    if grep -qE '^(server/|server\.workspace)'     <<<"$files"; then touched+=("server");  fi
    if grep -qE '^(web/|web\.workspace)'           <<<"$files"; then touched+=("web");    fi
    if grep -qE '^(contract/|contract\.workspace)' <<<"$files"; then touched+=("contract"); fi
    if grep -qE '^(e2e/|e2e\.workspace)'           <<<"$files"; then touched+=("e2e");    fi

    # Правка корневого package.json (добавление/удаление workspace и т.п.)
    # почти всегда затрагивает контракт — лучше пересобрать его явно.
    if grep -qE '^package\.json$' <<<"$files" && [[ ${#touched[@]} -gt 0 ]]; then
      touched+=("contract")
    fi

    if [[ ${#touched[@]} -eq 0 ]]; then
      # Правки только в README/.gitignore/scripts — гоняем всё для безопасности.
      touched=(server web contract e2e)
    fi
  fi

  printf '%s\n' "${touched[@]}" | sort -u
}

# Запустить npm-скрипт в workspace, с шапкой и понятным OK/FAIL.
# Использование: run_in_workspace <workspace> <script-label>
run_in_workspace() {
  local ws="$1"
  local label="$2"
  log_section "$ws :: $label"
  if npm run --workspace "$ws" --silent "$label"; then
    log_ok "$ws :: $label — OK"
    return 0
  else
    log_error "$ws :: $label — FAIL"
    return 1
  fi
}

# Проверить, есть ли в stdin (или в файлах из аргументов) хотя бы один
# манифест пакетов. Возвращает 0, если хотя бы один из
# package.json/package-lock.json/yarn.lock/pnpm-lock.yaml/bun.lockb присутствует.
# Использование:
#   manifest_changed < list-of-files
#   echo "package.json" | manifest_changed
manifest_changed() {
  local needle='(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb)$'
  local f
  for f in "$@"; do
    if [[ "$f" =~ $needle ]]; then return 0; fi
  done
  if [[ ! -t 0 ]]; then
    while IFS= read -r f; do
      if [[ "$f" =~ $needle ]]; then return 0; fi
    done
  fi
  return 1
}