# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
FROM dependencies AS build
COPY . .
ARG NEXT_BUILD_CPUS=2
ARG NODE_BUILD_MEMORY_MB=1536
ARG SITE_URL=https://lihvodruida.pp.ua
ENV NEXT_TELEMETRY_DISABLED=1 SITE_URL=$SITE_URL NEXT_BUILD_CPUS=$NEXT_BUILD_CPUS NODE_OPTIONS=--max-old-space-size=$NODE_BUILD_MEMORY_MB
RUN npm run typecheck && npm test && npm run build
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S -g 10001 site && adduser -S -u 10001 site -G site
COPY --from=build --chown=site:site /app/.next/standalone ./
USER site
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","server.js"]
