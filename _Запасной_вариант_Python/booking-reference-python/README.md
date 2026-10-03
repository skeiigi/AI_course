# Сервис бронирования тайм-слотов

Учебный эталонный проект курса «ИИ для разработчиков» (Сибирский федеральный
университет, Академия Softline).

Организатор заводит виды активности («Консультация», «Код-ревью») и расписания
к ним. Гость открывает страницу, видит сетку свободных слотов на неделю,
выбирает время и оставляет бронь. Занятый слот повторно забронировать нельзя.

Проект собран методом Design First: сначала контракт API на TypeSpec, потом
код, который этому контракту соответствует, потом тесты, которые это проверяют.

## Что внутри

| Часть | Технология |
|---|---|
| Backend | Python 3.12, FastAPI, Pydantic v2 |
| Хранение | SQLite через SQLAlchemy 2.x |
| Контракт | TypeSpec в `contract/main.tsp`, OpenAPI 3.1 в `contract/openapi.yaml` |
| Frontend | HTML, CSS, JavaScript без сборки, отдаётся тем же FastAPI |
| Тесты | pytest и httpx, 91 тест |
| Запуск | Docker и docker compose |
| CI | GitHub Actions: ruff и pytest |

## Запуск на Windows (PowerShell)

Выполняйте команды по одной, из папки с проектом.

```powershell
python -m venv .venv
```

```powershell
.venv\Scripts\Activate.ps1
```

Если PowerShell откажется выполнять скрипт активации, разрешите это для текущего
окна и повторите активацию:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

```powershell
pip install -r requirements.txt
```

```powershell
python seed.py
```

```powershell
uvicorn app.main:app --reload
```

Остановить сервер: сочетание клавиш Ctrl+C в том же окне.

## Запуск на macOS

```bash
python3 -m venv .venv
```

```bash
source .venv/bin/activate
```

```bash
pip install -r requirements.txt
```

```bash
python seed.py
```

```bash
uvicorn app.main:app --reload
```

Остановить сервер: сочетание клавиш Control+C в том же окне.

## Что открыть в браузере

| Адрес | Что там |
|---|---|
| http://127.0.0.1:8000 | интерфейс бронирования |
| http://127.0.0.1:8000/docs | интерактивная документация API (Swagger UI) |
| http://127.0.0.1:8000/redoc | та же документация в виде справочника |
| http://127.0.0.1:8000/openapi.json | схема OpenAPI, которую отдаёт код |

## Тесты

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

```powershell
pytest -q
```

macOS:

```bash
source .venv/bin/activate
```

```bash
pytest -q
```

Ожидаемый вывод:

```
.....................................................................    [100%]
91 passed in 1.8s
```

Проверка стиля кода (одинаково на обеих системах):

```bash
ruff check .
```

```bash
ruff format --check .
```

## Запуск в Docker

Команды одинаковы на Windows и на macOS. Нужен установленный Docker Desktop.

```bash
docker compose up -d --build
```

Сервис поднимется на http://localhost:8000, база наполнится демонстрационными
данными автоматически. Флаг `-d` уводит контейнер в фон, терминал остаётся
свободным. Посмотреть журнал: `docker compose logs -f`, выход Ctrl+C.
Остановить:

```bash
docker compose down
```

Удалить вместе с сохранёнными бронями:

```bash
docker compose down -v
```

## Контракт API

Источник истины это `contract/main.tsp`. Из него компилятор TypeSpec собирает
`contract/openapi.yaml` в формате OpenAPI 3.1.

**Собранный `contract/openapi.yaml` уже лежит в репозитории.** Он получен
настоящим компилятором TypeSpec версии 1.15.0, руками его никто не правил.
Чтобы запустить проект, Node.js не нужен: ставьте только Python.

Node.js нужен, только если вы меняете сам контракт:

```bash
cd contract
```

```bash
npm install
```

```bash
npx tsp compile .
```

Соответствие кода контракту проверяется тестами в `tests/test_contract.py`.
Они сравнивают схему, которую FastAPI отдаёт по `/openapi.json`, с файлом
контракта: пути, методы, наборы полей моделей, обязательные поля,
имена query-параметров.

## Эндпоинты

| Метод и путь | Что делает |
|---|---|
| `GET /api/activities` | список видов активности |
| `POST /api/activities` | создать вид активности |
| `GET /api/schedules` | список расписаний, фильтр `activity_id` |
| `POST /api/schedules` | создать расписание |
| `GET /api/slots` | слоты активности на диапазон дат |
| `GET /api/bookings` | список броней, фильтр `guest_email` |
| `POST /api/bookings` | создать бронь |
| `POST /api/bookings/{booking_id}/cancel` | отменить бронь |

Пример запроса слотов:

```bash
curl "http://127.0.0.1:8000/api/slots?activity_id=1&date_from=2026-10-05&date_to=2026-10-09"
```

Пример создания брони:

```bash
curl -X POST http://127.0.0.1:8000/api/bookings -H "Content-Type: application/json" -d "{\"activity_id\":1,\"date\":\"2026-10-05\",\"start_time\":\"10:00:00\",\"guest_name\":\"Иван Петров\",\"guest_email\":\"ivan@example.com\"}"
```

Повторный такой же запрос вернёт код 409 и текст «Этот слот уже забронирован».

## Структура репозитория

```
AGENTS.md                  файл памяти для ИИ-агента
README.md                  этот файл
requirements.txt           зависимости Python с точными версиями
pyproject.toml             настройки ruff и pytest
Dockerfile                 образ сервиса
docker-compose.yml         запуск одной командой
seed.py                    демонстрационные данные
contract/main.tsp          контракт API на TypeSpec
contract/openapi.yaml      собранный контракт OpenAPI 3.1
app/                       код сервиса
app/static/                интерфейс: HTML, CSS, JavaScript
tests/                     тесты pytest
docs/adr/                  архитектурные решения
docs/pdr/                  продуктовое решение
docs/ontology.md           доменная модель
.github/workflows/ci.yml   проверка кода в GitHub Actions
.github/copilot-instructions.md  правила для GitHub Copilot
```

## Если что-то не завелось

| Признак | Что делать |
|---|---|
| `python` не найден на Windows | попробуйте `py -3` вместо `python` |
| PowerShell не даёт активировать venv | выполните `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` |
| Порт 8000 занят | запустите с другим портом: `uvicorn app.main:app --reload --port 8001` |
| В интерфейсе пусто | выполните `python seed.py` и обновите страницу |
| Слотов нет ни в один день | у активности нет расписания, создайте его через `/docs` |
| Хочется начать с чистой базы | удалите файл `booking.db` и снова выполните `python seed.py` |
