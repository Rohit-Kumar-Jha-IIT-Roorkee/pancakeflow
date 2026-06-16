FROM node:20-slim
RUN npm i -g pnpm@9
WORKDIR /app
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY services/ingestion ./services/ingestion
RUN pnpm install --filter @pancakeflow/ingestion...
WORKDIR /app/services/ingestion
CMD ["pnpm", "start"]
