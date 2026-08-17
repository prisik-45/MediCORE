FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir uv
RUN groupadd --system app && useradd --system --gid app --home-dir /app app

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen

COPY backend ./backend
RUN chown -R app:app /app

ENV PYTHONPATH=/app
ENV PATH="/app/.venv/bin:$PATH"
ENV UV_CACHE_DIR=/tmp/uv-cache

USER app

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
