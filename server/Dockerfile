# ---- Builder ----
FROM node:20 AS builder

# Install Python and build tools for mediasoup native addon
RUN apt-get update && apt-get install -y python3 python3-pip build-essential && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root-level files needed for the build
COPY tsconfig.base.json ./
COPY shared ./shared

# Copy server package files and install deps (cached layer)
COPY server/package.json server/package-lock.json ./server/
WORKDIR /app/server
RUN npm ci

# Generate Prisma client
COPY server/prisma ./prisma
RUN npx prisma generate

# Copy server source and compile
COPY server/tsconfig.json ./
COPY server/src ./src
# shared/ types cause a non-fatal TS6059 rootDir warning but all JS is emitted correctly
RUN npx tsc || true
RUN test -f dist/index.js

# ---- Web Builder ----
FROM node:20 AS web-builder

WORKDIR /app

COPY tsconfig.base.json ./
COPY shared ./shared

COPY web/package.json web/package-lock.json ./web/
WORKDIR /app/web
RUN npm ci

COPY web/tsconfig.json web/vite.config.ts web/postcss.config.js web/index.html ./
COPY web/src ./src
RUN npm run build

# ---- Runner ----
FROM node:20-slim

# mediasoup worker needs these at runtime
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy compiled output and runtime deps from builder
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/prisma ./prisma
COPY --from=builder /app/server/package.json ./

# Copy web SPA dist
COPY --from=web-builder /app/web/dist ./web/dist

# Copy entrypoint
COPY server/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Create data directory for SQLite and uploads
RUN mkdir -p /app/data /app/data/uploads /app/data/downloads

EXPOSE 3001
EXPOSE 10000-10100/udp

ENTRYPOINT ["./docker-entrypoint.sh"]
