# ---- Build stage ----
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Baked in at build time — Next.js inlines NEXT_PUBLIC_* into the client
# bundle, so this can't be a runtime env var like the rest of the config.
# Firebase Hosting's rewrite makes this same-origin in production anyway;
# this direct Cloud Run URL is what makes the service usable on its own too.
ENV NEXT_PUBLIC_API_URL=https://api-432175584982.us-central1.run.app
RUN npm run build

# ---- Runtime stage: Next's standalone output only needs these three ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# Cloud Run injects PORT — Next's standalone server.js reads it directly.
EXPOSE 8080
CMD ["node", "server.js"]
