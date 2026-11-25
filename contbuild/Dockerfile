# ===================================
# BUILD STAGE
# ===================================
FROM node:22-bookworm-slim AS build

WORKDIR /app

# Outils nécessaires aux modules natifs (bcrypt, better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copier les fichiers de dépendances
COPY package*.json ./

# Installation reproductible
RUN npm ci --omit=dev

# Copier le projet
COPY . .


# ===================================
# PRODUCTION STAGE
# ===================================
FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copier l'application et ses dépendances
COPY --from=build --chown=node:node /app /app

# Utilisateur non privilégié
USER node

EXPOSE 3000

CMD ["npm", "start"]