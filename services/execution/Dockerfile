FROM node:20-slim
RUN npm i -g pnpm@9
WORKDIR /app
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY services/execution ./services/execution
RUN pnpm install --filter @pancakeflow/execution...
WORKDIR /app/services/execution
CMD ["pnpm", "start"]
