# Frontend Dockerfile for Nx monorepo
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Stage 1: Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/kiosk-lib/package.json ./packages/kiosk-lib/
RUN pnpm install --frozen-lockfile --filter @quokkaq/frontend... --prod

# Stage 2: Build the application
FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/kiosk-lib/package.json ./packages/kiosk-lib/
RUN pnpm install --frozen-lockfile --filter @quokkaq/frontend...

# Copy source code for packages and frontend
COPY nx.json tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY packages/kiosk-lib ./packages/kiosk-lib
COPY apps/frontend ./apps/frontend

# Build arguments for Next.js
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

# Build the frontend
WORKDIR /app/apps/frontend
RUN pnpm run build

# Stage 3: Production runtime
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

ENV NODE_ENV=production

# Copy built application
COPY --from=builder /app/apps/frontend/public ./public

# Create .next directory with proper permissions
RUN mkdir .next && chown -R node:node .next

# Copy standalone output and static files
COPY --from=builder --chown=node:node /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/frontend/.next/static ./.next/static

USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/frontend/server.js"]
