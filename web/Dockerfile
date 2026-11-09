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
# Fraud Defense (App Check) site key -- not a secret, same reasoning as the
# Firebase config values in lib/firebase.ts (domain-locked, meant to ship in
# the client bundle). Registered against hit-organization.web.app,
# hit-organization.firebaseapp.com, and localhost -- see lib/firebase.ts.
ENV NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY=6LcpJ9ctAAAAAAnLc7Qrxd26P41Xx2JIFiVtClW_
RUN npm run build
# Browser source maps (next.config productionBrowserSourceMaps) move OUT of
# the publicly served .next/static into a private folder — only
# app/admin-tools/error-source reads them, for system_admin. Fails the build
# if any .map would still be served.
RUN mkdir -p /app/.sourcemaps \
 && cd /app/.next/static \
 && find . -name '*.map' -exec cp --parents {} /app/.sourcemaps/ \; \
 && find . -name '*.map' -delete \
 && test -z "$(find /app/.next/static -name '*.map' | head -1)"

# ---- Runtime stage: Next's standalone output only needs these three ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/.sourcemaps ./.sourcemaps

# Cloud Run injects PORT — Next's standalone server.js reads it directly.
EXPOSE 8080
CMD ["node", "server.js"]
