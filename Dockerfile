FROM node:24-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY frontend/ ./
COPY shared/ /app/shared/
RUN npm run build

FROM node:24-bookworm-slim AS backend-dependencies
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=5000 INTEGRATIONS_DIRECTORY=/var/lib/aurelia
WORKDIR /app/backend
RUN mkdir -p /var/lib/aurelia && chown node:node /var/lib/aurelia
COPY --from=backend-dependencies --chown=node:node /app/backend/node_modules ./node_modules
COPY --chown=node:node backend/ ./
COPY --chown=node:node shared/ /app/shared/
COPY --from=frontend-build --chown=node:node /app/frontend/dist-admin /app/frontend/dist-admin
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD node -e "fetch('http://127.0.0.1:5000/readyz',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
