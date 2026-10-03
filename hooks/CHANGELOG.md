# Changelog

Все значимые изменения в наборе хуков фиксируются в этом документе.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
проект следует [Semantic Versioning](https://semver.org/lang/ru/).

## [Не выпущено]

### Новое

- **`post-merge`** — автоматически подтягивает зависимости после
  `git pull` / merge, если среди изменений оказался один из манифестов
  пакетов: `package.json`, `package-lock.json`, `yarn.lock`,
  `pnpm-lock.yaml`, `bun.lockb`. Определяет менеджер по наличию
  lockfile и вызывает предпочтительно `npm ci` (или эквивалент с
  `--frozen-lockfile`). Молчит, если merge не настоящий (флаг `$1 = 0`).
  Пропустить можно, задав `HOOK_SKIP_INSTALL=1` в окружении.
- **`post-checkout`** — то же самое после `git checkout <ref>` (смена
  ветки или коммита), если манифесты пакетов отличаются между старым и
  новым HEAD. Сравнение идёт через `git diff --name-only PREV NEW`,
  перевызов установщика только при фактическом расхождении.
- **`shared/git-helpers.sh`: `manifest_changed`** — новая общая утилита:
  принимает список путей из аргументов или stdin и возвращает `0`, если
  хотя бы один из них — манифест пакетов. Используется и в `post-merge`,
  и в `post-checkout`, чтобы не дублировать регэксп.
- **`husky/`** — каталог с husky-совместимыми обёртками (`pre-commit`,
  `commit-msg`, `pre-push`). Каждая обёртка — однострочник, который
  вызывает соответствующий скрипт из `hooks/`; логика не дублируется,
  единый источник правды остаётся в `hooks/`. Поставляется как
  **заготовка**: чтобы husky подхватил обёртки, нужно поставить husky
  (`npm i -D husky && npx husky install`) и скопировать каталог
  `husky/` в `<repo>/.husky/`.
- **`install.sh --with-husky`** / **`install.ps1 -WithHusky`** —
  расширение установщиков, опционально копирующее husky-обёртки в
  `<repo>/.husky/` после основной установки. С выводом подсказки
  «не забудьте `npm i -D husky`».

### Исправления

- В `install.sh` / `install.ps1` расширен список устанавливаемых хуков:
  раньше копировались только `pre-commit / commit-msg / pre-push`,
  теперь — также `post-merge / post-checkout`. Без этого правки новые
  хуки не попадали бы в `.git/hooks/`.
- `post-merge` упрощён: вместо собственного цикла с `case "$f"` теперь
  вызывает `manifest_changed` из `git-helpers.sh`. Это убирает
  повторение регэкспа, который также живёт в `post-checkout`, и
  позволяет его тестировать в изоляции.
- `smoke-test.sh`: убран блок тестов, пытавшийся подменять `git diff-tree`
  через `export -f` — выяснилось, что `post-merge` запускается как
  отдельный процесс и подмену не видит. Заменено на чистые unit-тесты
  `manifest_changed` (11 кейсов) плюс smoke-проверки быстрых путей
  `post-merge` (флаг merge=0, `HOOK_SKIP_INSTALL=1`).
- Устранены дубли `echo` и `echo "ALL TESTS PASSED"` в `smoke-test.sh`.

### Документация

- `README.md`:
  - в таблице «Что входит» добавлены строки для `post-merge`,
    `post-checkout`, `husky/`, `smoke-test.sh`;
  - добавлен блок установки с флагами `--with-husky` / `-WithHusky`;
  - добавлен раздел «post-merge / post-checkout» с описанием механики;
  - в разделе «Пропуск хуков» отмечено, что для `post-*` хуков
    используется `HOOK_SKIP_INSTALL=1`, а не `--no-verify`;
  - в «Доработке под себя» уточнено, как именно подключить husky через
    готовые обёртки.
- `husky/README.md` — короткая инструкция по активации husky-обёрток.

## [1.0.0] — 2026-02-10

### Новое

- Набор git-хуков для монорепо `booking-reference` (npm workspaces:
  `server`, `web`, `contract`, `e2e`) без зависимостей на husky /
  lint-staged — чистые bash-скрипты, готовые к копированию в
  `.git/hooks/`.
- `pre-commit` — прогоняет `typecheck` (+ `test` для server, `build`
  для contract) только по workspace, затронутым staged-файлами. Правка
  корневого `package.json` автоматически тянет за собой пересборку
  контракта, чтобы openapi и TypeScript-типы не разошлись.
- `commit-msg` — проверяет формат Conventional Commits
  (`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `build`, `ci`, `chore`, `revert` + опциональные `scope` и маркер `!`).
  Служебные сообщения (`Merge ...`, `Revert ...`, `fixup!`, `squash!`)
  пропускаются без проверки.
- `pre-push` — последний рубеж перед отправкой на сервер: полный
  `typecheck` по всем workspace плюс `build` контракта. Опционально —
  запуск e2e (Playwright) при `HOOK_RUN_E2E=1`.
- `shared/git-helpers.sh` — общие утилиты: цветной лог (`log_info`,
  `log_ok`, `log_warn`, `log_error`, `log_section`), `staged_files`,
  `staged_files_in`, `detect_workspaces`, `run_in_workspace`, `fail`.
- `install.sh` / `install.ps1` — установщики для bash и PowerShell.
  Копируют хуки и общие утилиты в `.git/hooks/` выбранного
  репозитория и проставляют бит `+x`.
- `.gitignore.example` — готовый `.gitignore` для корня монорепо
  `booking-reference`.
- `smoke-test.sh` — автономные тесты логики хуков (без git-репозитория).

### Исправления

- В `detect_workspaces` исправлен приоритет сортировки: теперь
  результат всегда стабильно сортируется через `printf | sort -u`. В
  первой версии порядок вывода зависел от того, какая ветка
  сработала (полные vs. пустые staged-файлы), из-за чего smoke-тест на
  «только README» возвращал `server web contract e2e` вместо
  ожидаемого `contract e2e server web`. Приведено к единому виду — все
  ветки пишут в один массив `touched`, печать — один `printf | sort -u`.

### Документация

- `README.md` — как установить (`install.sh` / `install.ps1`), что
  делает каждый хук, как пропустить проверку (`--no-verify`), как
  доработать под себя.
- Сам `CHANGELOG.md` — этот файл, фиксирует изменения в самом наборе
  хуков.

[Не выпущено]: https://example.com/booking-hooks/compare/HEAD
[1.0.0]: https://example.com/booking-hooks/releases/tag/v1.0.0