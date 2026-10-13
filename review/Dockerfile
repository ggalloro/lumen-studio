# Build stage: install all dependencies, compile TypeScript, then drop dev dependencies.
FROM node:22-slim AS build
# Toolchain for better-sqlite3 in case no prebuilt binary matches the platform.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Runtime stage.
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=8084 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8084
VOLUME ["/data"]
CMD ["node", "dist/server.js"]
