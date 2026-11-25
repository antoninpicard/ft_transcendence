# ===================================
# BUILD STAGE: build the Vue front
# ===================================
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY webapp/frontend/package*.json ./
RUN npm ci

COPY webapp/frontend/ ./
RUN npm run build


# ===================================
# PRODUCTION STAGE: serve it
# ===================================
FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY webapp/frontend/package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY webapp/frontend/server.js ./

USER node

EXPOSE 3000

CMD ["npm", "start"]
