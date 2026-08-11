# Debian rather than Alpine, and Node 22 rather than 20, for two reasons that bit us on the Pi:
# Prisma's engines are built against glibc + OpenSSL 3 and fail to load on musl — it probes for
# libssl, defaults to "openssl-1.1.x", and the engine dies with an unparseable response — and parts
# of the Nx toolchain declare `node >=22.13.0`.
FROM node:22-bookworm-slim AS build
WORKDIR /workspace
# openssl is what Prisma probes for; ca-certificates is needed for the HTTPS calls the app makes.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm ci
RUN npx prisma generate
RUN npx nx build api

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# The query engine loads libssl at runtime too, not only during `prisma generate`.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /workspace/apps/api/.next/standalone ./
COPY --from=build /workspace/apps/api/.next/static ./apps/api/.next/static
COPY --from=build /workspace/apps/api/public ./apps/api/public
# STORAGE_ROOT is a named volume in docker-compose.prod.yml. Docker seeds a fresh named volume
# from the image's directory, ownership included, so creating it as `node` here is what makes it
# writable once the container drops to that user.
RUN mkdir -p /data/storage && chown -R node:node /data/storage
# The official Node images ship a built-in unprivileged `node` user (uid 1000); the standalone
# server needs no root privileges and listens on 3000, so run as it rather than root.
USER node
EXPOSE 3000
CMD ["node", "apps/api/server.js"]
