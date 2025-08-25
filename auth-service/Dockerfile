# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app

# Build stage: install deps and build the app (no node_modules copied between stages)
FROM base AS build
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Runner stage: install only production deps; no node_modules COPY
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY --from=build /app/prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate
COPY --from=build /app/dist ./dist
CMD ["node", "dist/index.js"]
