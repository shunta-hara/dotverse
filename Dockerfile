FROM node:20-alpine AS deps
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY shared/ ./shared/
COPY backend/ ./backend/
RUN cd backend && npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma

EXPOSE 4000

# DATABASE_URL は直接渡すか、DB_HOST/DB_USER/DB_PASSWORD/DB_NAME から組み立てる
CMD ["sh", "-c", "\
  if [ -z \"$DATABASE_URL\" ]; then \
    export DATABASE_URL=\"postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME}?sslmode=require\"; \
  fi && \
  cd /app/backend && \
  node_modules/.bin/prisma migrate deploy && \
  node dist/backend/src/index.js \
"]
