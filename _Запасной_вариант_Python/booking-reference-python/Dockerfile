# Образ для запуска сервиса одной командой.
# Берём slim-вариант: он небольшой и в нём есть всё нужное для Python.
FROM python:3.12-slim

# Python не пишет файлы .pyc и не буферизует вывод, так логи видны сразу.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Зависимости копируем отдельно, чтобы Docker не переустанавливал их
# при каждом изменении кода.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY seed.py ./
COPY contract ./contract
COPY tests ./tests
COPY pyproject.toml ./

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
