FROM python:3.11-slim
WORKDIR /app
COPY agents/requirements.txt ./agents/requirements.txt
RUN pip install --no-cache-dir -r agents/requirements.txt
COPY agents ./agents

RUN addgroup --system pancake && adduser --system --ingroup pancake pancake
USER pancake
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD python -c "import redis, os; redis.Redis.from_url(os.getenv('REDIS_URL', 'redis://localhost:6379')).ping()" || exit 1

CMD ["python", "-m", "agents.main"]
