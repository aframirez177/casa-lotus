# syntax=docker/dockerfile:1.7
# Casa Lotus · platform API. Build context is web/ (the server imports ../shared):
#   docker compose build            (from web/server, see docker-compose.yml)
#   docker build -f server/Dockerfile ..   (by hand, from web/server)
FROM node:24-slim AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:24-slim
ENV NODE_ENV=production \
    TZ=America/Bogota \
    PORT=3000 \
    SQLITE_PATH=/app/data/casalotus.db
WORKDIR /app/server
COPY --from=deps /app/server/node_modules ./node_modules
COPY shared/ /app/shared/
COPY server/package.json ./
COPY server/migraciones ./migraciones
COPY server/scripts ./scripts
COPY server/src ./src
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/salud').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
