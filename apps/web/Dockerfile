FROM node:20-slim
RUN npm i -g pnpm@9
WORKDIR /app
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web ./apps/web
RUN pnpm install --filter @pancakeflow/web...
WORKDIR /app/apps/web
RUN pnpm build
CMD ["pnpm", "start"]
