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
CMD ["sh", "-c", "cd /app/backend && node_modules/.bin/prisma migrate deploy && node dist/backend/src/index.js"]
