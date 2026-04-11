# E2E runner: Node + pinned Chromium (Debian security) for reproducible Testplane screenshots.
# Bump CHROMIUM_VERSION when the base image's Debian suite updates and apt fails to resolve the pin.
FROM node:22-bookworm-slim

ARG CHROMIUM_VERSION=147.0.7727.55-1~deb12u1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium=${CHROMIUM_VERSION} \
    fontconfig \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
  && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /workspace
