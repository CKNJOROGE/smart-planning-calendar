FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV RUN_MIGRATIONS_ON_START=false

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY migrations ./migrations
COPY run_migrations.py .
COPY .env.example ./.env.example

EXPOSE 8000

CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS_ON_START\" = \"true\" ]; then python run_migrations.py; fi; uvicorn app.main:app --host 0.0.0.0 --port 8000"]
