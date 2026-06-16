FROM python:3.11-slim
WORKDIR /app
COPY agents/requirements.txt ./agents/requirements.txt
RUN pip install --no-cache-dir -r agents/requirements.txt
COPY agents ./agents
CMD ["python", "-m", "agents.main"]
