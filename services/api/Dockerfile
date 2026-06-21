FROM python:3.11-slim
WORKDIR /app
COPY agents/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agents ./agents
COPY services/api ./services/api

RUN addgroup --system pancake && adduser --system --ingroup pancake pancake
USER pancake
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

WORKDIR /app/services/api
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
