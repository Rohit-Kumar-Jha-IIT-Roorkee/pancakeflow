FROM node:20-slim
RUN npm i -g pnpm@9
WORKDIR /app
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY services/execution ./services/execution
RUN pnpm install --filter @pancakeflow/execution...

RUN addgroup --system pancake && adduser --system --ingroup pancake pancake
USER pancake
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD node -e "require('net').connect(6379, process.env.REDIS_URL ? new URL(process.env.REDIS_URL).hostname : 'localhost', ()=>process.exit(0)).on('error', ()=>process.exit(1))" || exit 1

WORKDIR /app/services/execution
CMD ["pnpm", "start"]
