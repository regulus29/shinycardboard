# Build from the repo root: docker build -f apps/sync/Dockerfile -t shiny-sync .
FROM node:22-alpine
WORKDIR /app

# Install with the lockfile first so this layer caches between code changes
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/sync/package.json apps/sync/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @sc/sync --include-workspace-root

COPY packages/core packages/core
COPY apps/sync apps/sync

# Bind all interfaces inside the container; the compose file publishes it to loopback only
ENV HOST=0.0.0.0 PORT=8787 SYNC_DATA_DIR=/data
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
CMD ["npm", "run", "start", "-w", "@sc/sync"]
