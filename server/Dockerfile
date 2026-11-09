# ---- Build stage: compile TypeScript to dist/ ----
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage: production deps only, compiled JS only ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Source ships alongside dist/ so System Health can show the actual lines of
# code behind a server error (services/codeLocator.ts) — read-only, never
# served over HTTP.
COPY --from=build /app/src ./src

# Cloud Run injects PORT and expects the container to listen on it —
# src/index.ts already reads process.env.PORT and binds 0.0.0.0.
EXPOSE 8080
# --enable-source-maps: stack traces point at src/**/*.ts lines (via the
# dist/*.js.map files tsc already emits) instead of compiled JS.
CMD ["node", "--enable-source-maps", "dist/index.js"]
