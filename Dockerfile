# syntax=docker/dockerfile:1.7
FROM node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532 AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global corepack@0.35.0 && corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM build AS parser
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs parser \
  && mkdir -p /var/lib/vitae/artifacts /var/lib/vitae/parser-queue \
  && chown -R parser:nodejs /var/lib/vitae
USER parser
CMD ["node", "node_modules/tsx/dist/cli.mjs", "scripts/parser-worker.ts"]

FROM build AS job-fetcher
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs fetcher \
  && mkdir -p /var/lib/vitae/job-fetch-queue \
  && chown -R fetcher:nodejs /var/lib/vitae/job-fetch-queue
USER fetcher
CMD ["node", "node_modules/tsx/dist/cli.mjs", "scripts/job-fetch-worker.ts"]

FROM build AS deletion-worker
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs deleter \
  && mkdir -p /var/lib/vitae/artifacts /var/lib/vitae/parser-queue /var/lib/vitae/job-fetch-queue \
  && chown -R deleter:nodejs /var/lib/vitae
USER deleter
CMD ["node", "node_modules/tsx/dist/cli.mjs", "scripts/workspace-deletion-worker.ts"]

FROM node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532 AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /var/lib/vitae/artifacts /var/lib/vitae/parser-queue /var/lib/vitae/job-fetch-queue \
  && chown -R nextjs:nodejs /var/lib/vitae
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
