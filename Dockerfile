# BonList all-in-one (API + web UI)
# Build: docker build -t bonlist .
# Run:   docker run --rm -p 8080:8080 --env-file .env -e PORT=8080 bonlist

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts
COPY mobile ./mobile
COPY workers ./workers
COPY wrangler.toml ./
RUN pnpm install --frozen-lockfile
ENV BONLIST_SKIP_MOBILE_POSTBUILD=1
ENV CI=true
RUN pnpm --filter @workspace/careerbridge-sa run build
RUN pnpm --filter @workspace/api-server run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_URL=pglite
ENV PGLITE_DATA_DIR=/tmp/bonlist-pglite
ENV STATIC_DIR=/app/artifacts/careerbridge-sa/dist/public
RUN corepack enable
COPY --from=build /app /app
EXPOSE 8080
CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
