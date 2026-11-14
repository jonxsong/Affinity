FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
EXPOSE 3000
CMD ["pnpm", "--filter", "@affinity/web", "dev", "--hostname", "0.0.0.0"]

