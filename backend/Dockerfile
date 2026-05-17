FROM python:3.12-slim

WORKDIR /app

RUN pip install uv
COPY pyproject.toml ./
RUN uv sync 

COPY backend ./backend

ENV PYTHONPATH=/app
ENV PATH="/app/.venv/bin:$PATH"

CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
