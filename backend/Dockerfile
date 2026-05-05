FROM python:3.12-slim

WORKDIR /app

RUN pip install uv
COPY pyproject.toml ./
RUN uv sync --no-dev

COPY backend ./backend

ENV PYTHONPATH=/app
CMD ["uv", "run", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
