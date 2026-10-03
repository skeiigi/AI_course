#!/usr/bin/env bash
# Установщик git-хуков из этой папки в указанный git-репозиторий.
#
# Использование:
#   ./install.sh                 # установить в текущий репозиторий (.)
#   ./install.sh /path/to/repo   # установить в указанный
#
# Скрипт:
#   1) проверяет, что <repo> — git-репозиторий;
#   2) копирует pre-commit / commit-msg / pre-push / post-merge / post-checkout
#      и shared/ в <repo>/.git/hooks/;
#   3) делает исполняемыми.
#   4) при флаге --with-husky дополнительно копирует husky-обёртки в .husky/.

set -euo pipefail

HOOKS_SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_REPO="${1:-$(pwd)}"

if [[ ! -d "$TARGET_REPO/.git" ]]; then
  printf '\033[31m[install]\033[0m "%s" не является git-репозиторием (нет .git/)\n' "$TARGET_REPO" >&2
  exit 1
fi

TARGET_HOOKS_DIR="$TARGET_REPO/.git/hooks"
mkdir -p "$TARGET_HOOKS_DIR/shared"

# Основные git-хуки
for hook in pre-commit commit-msg pre-push post-merge post-checkout; do
  src="$HOOKS_SRC_DIR/$hook"
  if [[ ! -f "$src" ]]; then
    printf '\033[33m[install]\033[0m %s отсутствует — пропускаю.\n' "$hook" >&2
    continue
  fi
  cp -f "$src" "$TARGET_HOOKS_DIR/$hook"
  chmod +x "$TARGET_HOOKS_DIR/$hook"
  printf '\033[32m[install]\033[0m установлен %s/%s\n' "$TARGET_HOOKS_DIR" "$hook"
done

# Общие утилиты — копируем, чтобы всё было автономно
cp -f "$HOOKS_SRC_DIR/shared/git-helpers.sh" "$TARGET_HOOKS_DIR/shared/git-helpers.sh"
chmod +x "$TARGET_HOOKS_DIR/shared/git-helpers.sh"
printf '\033[32m[install]\033[0m установлен %s/shared/git-helpers.sh\n' "$TARGET_HOOKS_DIR"

# Опционально: husky-обёртки. Копируются только если есть флаг --with-husky
# или если установщик запущен из husky-режима.
if [[ "${2:-}" == "--with-husky" ]]; then
  HUSKY_DST="$TARGET_REPO/.husky"
  mkdir -p "$HUSKY_DST"
  for f in pre-commit commit-msg pre-push; do
    if [[ -f "$HOOKS_SRC_DIR/husky/$f" ]]; then
      cp -f "$HOOKS_SRC_DIR/husky/$f" "$HUSKY_DST/$f"
      chmod +x "$HUSKY_DST/$f"
      printf '\033[32m[install]\033[0m установлен %s/%s (husky)\n' "$HUSKY_DST" "$f"
    fi
  done
  printf '\033[33m[install]\033[0m не забудьте: npm i -D husky && npx husky install\n'
fi

printf '\033[32m[install]\033[0m готово.\n'