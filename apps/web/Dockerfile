FROM node:20-slim
RUN npm i -g pnpm@9
WORKDIR /app
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web ./apps/web
RUN pnpm install --filter @pancakeflow/web...
WORKDIR /app/apps/web
ARG NEXT_PUBLIC_API="http://localhost:8000"
ENV NEXT_PUBLIC_API=$NEXT_PUBLIC_API
RUN pnpm build

RUN addgroup --system pancake && adduser --system --ingroup pancake pancake
USER pancake
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) process.exit(1)}).on('error', () => process.exit(1))" || exit 1

CMD ["pnpm", "start"]
