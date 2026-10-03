"""Точка входа приложения.

Здесь собирается FastAPI: подключаются роутеры и раздаётся фронтенд.
Запуск: uvicorn app.main:app --reload
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.database import create_tables
from app.errors import ApiError, describe_validation_error
from app.routers import activities, bookings, schedules, slots

logger = logging.getLogger("booking")

STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Создаёт таблицы при старте сервиса."""
    create_tables()
    yield


app = FastAPI(
    title="Сервис бронирования тайм-слотов",
    description="Учебный сервис бронирования по типу Calendly. Курс «ИИ для разработчиков», СФУ.",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Единая обработка ошибок
#
# В каждом обработчике достаточно бросить ApiError, а превращение его в ответ
# с телом {code, message} происходит здесь. Зеркало app.setErrorHandler
# из эталонного проекта на TypeScript, файл server/src/app.ts.
# ---------------------------------------------------------------------------


@app.exception_handler(ApiError)
async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
    """Ошибка, которую сервис вернул осознанно: код и текст уже готовы."""
    return JSONResponse(status_code=exc.status_code, content=exc.body)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Данные не прошли проверку. Собираем из разбора одно понятное сообщение.

    Пример: «guest_email: Почта указана неверно; duration_minutes: Длительность
    меньше 5 минут». Так же выглядит ответ эталона на TypeScript.
    """
    return JSONResponse(
        status_code=422,
        content={"code": "validation_failed", "message": describe_validation_error(exc)},
    )


@app.exception_handler(StarletteHTTPException)
async def handle_http_error(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Ответы, которые породил сам фреймворк. Чаще всего это неизвестный путь."""
    if exc.status_code == 404:
        return JSONResponse(
            status_code=404,
            content={"code": "route_not_found", "message": "Такого эндпоинта нет"},
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": "internal_error", "message": str(exc.detail)},
    )


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    """Сбой сервиса. Подробности пишем в журнал, наружу отдаём общий текст,
    чтобы не раскрывать устройство сервиса."""
    logger.exception("Необработанная ошибка при обработке запроса %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"code": "internal_error", "message": "Внутренняя ошибка сервиса"},
    )

app.include_router(activities.router)
app.include_router(schedules.router)
app.include_router(slots.router)
app.include_router(bookings.router)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    """Отдаёт главную страницу интерфейса."""
    return FileResponse(STATIC_DIR / "index.html")
