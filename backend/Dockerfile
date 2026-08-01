# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src/

RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

RUN addgroup -S nestjs && adduser -S nestjs -G nestjs

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

RUN chown -R nestjs:nestjs /app
USER nestjs

EXPOSE 3001

# Readiness, not the bare health endpoint. /api/v1/health answers 200 from static values and
# touches nothing, so a container whose database was unreachable used to report itself healthy —
# the exact failure the readiness probe was built to make visible. /health/ready answers 503 when
# any dependency is down, and anything other than 200 is unhealthy here.
#
# --start-period covers `prisma migrate deploy` against the shared cloud Postgres plus Nest boot;
# readiness cannot pass until both finish, and the previous 20s could mark a container unhealthy
# while it was still legitimately migrating. Failures inside the start period do not count towards
# --retries, so a generous value costs only a slower verdict on a container that was never going
# to start, and Render cancels a deploy at 15 minutes regardless.
#
# Docker runs this. Render does not — its health check is a dashboard setting. See docs/RUNBOOK.md §2.2.
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/v1/health/ready',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
