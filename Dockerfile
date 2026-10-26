# ── AliceMail en producción (VM Oracle Cloud ARM) ────────────────────
# Build multi-stage para Next.js 16 + Prisma + SQLite
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock* package-lock.json* yarn.lock* ./
RUN npm install --no-audit --no-fund

FROM node:22-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL=file:/app/db/custom.db
RUN npx prisma generate && npx prisma db push --skip-generate && npm run build

FROM node:22-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/db/custom.db
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# esquema prisma + cliente para migraciones en arranque
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
# La BD vive en el volumen montado en /app/db (persistente)
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss || true; node server.js"]
