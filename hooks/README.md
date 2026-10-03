# Git-хуки для `booking-reference`

Готовый набор хуков под монорепо `booking-reference` (npm workspaces:
`server`, `web`, `contract`, `e2e`). Подключается в любой git-репозиторий
копированием — без husky / lint-staged, без дополнительных dev-зависимостей.

## Что входит

| Файл                    | Назначение                                                                 |
|-------------------------|----------------------------------------------------------------------------|
| `pre-commit`            | typecheck + test для затронутых workspace; build для contract              |
| `commit-msg`            | проверка Conventional Commits                                             |
| `pre-push`              | полный typecheck по всем workspace; опционально e2e (`HOOK_RUN_E2E=1`)    |
| `post-merge`            | авто-`npm ci` / `pnpm install` / `yarn install` после merge, если изменился манифест пакетов |
| `post-checkout`         | то же после переключения ветки                                              |
| `shared/git-helpers.sh` | общие функции: определение workspace, цветной лог, запуск npm-скриптов    |
| `husky/`                | husky-совместимые обёртки (опционально)                                     |
| `install.sh` / `install.ps1` | установка хуков в `.git/hooks/` выбранного репозитория               |
| `.gitignore.example`    | разумный `.gitignore` для корня монорепо                                   |
| `smoke-test.sh`         | автотесты логики хуков (без git-репозитория)                               |

## Установка

### Bash / WSL / macOS / Linux

```bash
# Из корня монорепо
./hooks/install.sh

# Или из любой директории, явно указав цель
./hooks/install.sh /path/to/booking-reference

# Дополнительно с husky-обёртками
./hooks/install.sh /path/to/booking-reference --with-husky
```

### PowerShell (Windows)

```powershell
# Из корня монорепо
pwsh ./hooks/install.ps1

# Или с явной целью
pwsh ./hooks/install.ps1 -TargetRepo "D:\path\to\booking-reference"

# Дополнительно с husky-обёртками
pwsh ./hooks/install.ps1 -TargetRepo "D:\path\to\booking-reference" -WithHusky
```

После установки в `<repo>/.git/hooks/` появятся `pre-commit`, `commit-msg`,
`pre-push`, `post-merge`, `post-checkout` и каталог `shared/` рядом с ними.

## Поведение

### pre-commit

1. Смотрит на staged-файлы (`git diff --cached --name-only`).
2. Определяет, какие workspace затронуты.
3. Гоняет только нужные проверки:
   - `server` → `typecheck` + `test` (Vitest)
   - `web` → `typecheck` (Vite/React)
   - `contract` → `build` (TypeSpec)
   - `e2e` → `typecheck` (Playwright)
4. Если ничего не понятно (правки только в общих файлах) — гоняет всё.
5. Падение любого шага ⇒ коммит отменяется.

### commit-msg

Принимает только сообщения вида:

```
<type>(<scope>)?(!)?: <subject>
```

`type` ∈ `feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert`.
`scope` — необязательное, обычно имя workspace.
`!` — маркер breaking change.

Служебные сообщения (`Merge ...`, `Revert ...`, `fixup!`, `squash!`) проходят без проверки.

### pre-push

- Всегда: `typecheck` для `server` / `web` / `e2e` + `build` для `contract`.
- Опционально: `npm run e2e` (Playwright), если задано `HOOK_RUN_E2E=1`.

### post-merge / post-checkout

Авто-установка пакетов, если в новом коммите изменился один из
манифестов: `package.json`, `package-lock.json`, `yarn.lock`,
`pnpm-lock.yaml`, `bun.lockb`. Менеджер определяется по наличию
lockfile, после чего вызывается `npm ci` (или эквивалент с
`--frozen-lockfile`). Пропустить можно, задав `HOOK_SKIP_INSTALL=1`
в окружении.

## Пропуск хуков (когда очень надо)

```bash
git commit --no-verify -m "WIP: ..."
git push    --no-verify
```

`post-*` хуки `--no-verify` не поддерживают — для них используется
переменная окружения `HOOK_SKIP_INSTALL=1`.

## Доработка под себя

- Хочется ESLint/Prettier — добавьте запуск в `pre-commit` рядом с `typecheck`.
- Хочется `gitleaks` — поставьте в `pre-commit` вызов бинарника.
- Хочется husky/lint-staged — киньте husky-обёртки из `husky/` в
  `<repo>/.husky/` (через `install.sh --with-husky`), затем поставьте
  husky `npm i -D husky && npx husky install`. Логика не дублируется —
  husky просто перевызывает основные хуки из `hooks/`.