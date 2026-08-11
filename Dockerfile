# One Dockerfile for all three images, so the dependency install happens ONCE.
#
# The api, migrate and web images previously came from two Dockerfiles, which meant BuildKit had no
# way to share work between them: `npm ci` ran twice, installing the same ~2500 packages each time.
# On a Raspberry Pi that alone cost about five minutes per deploy. A shared `deps` stage fixes it —
# every image below builds on top of the same install.
#
# Targets:
#   api-runtime   the Next.js standalone server            (compose service `api`)
#   migrate       workspace + Prisma CLI, for one-off jobs (compose service `migrate`)
#   web-runtime   nginx serving the Angular bundle         (compose service `web`)
#
# Debian rather than Alpine, and Node 22 rather than 20, for two reasons that bit us on the Pi:
# Prisma's engines are built against glibc + OpenSSL 3 and fail to load on musl — it probes for
# libssl, defaults to "openssl-1.1.x", and the engine dies with an unparseable response — and parts
# of the Nx toolchain declare `node >=22.13.0`.

# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /workspace
# openssl is what Prisma probes for; ca-certificates is needed for outbound HTTPS.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Manifests only: this layer and the install below stay cached across every commit that does not
# change a dependency. Copying the source first would reinstall on every push.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY libs/shared/types/package.json libs/shared/types/
RUN --mount=type=cache,target=/root/.npm npm ci

# ---------------------------------------------------------------------------
FROM deps AS source
COPY . .

# ---------------------------------------------------------------------------
# Kept as its own target: the migrate job needs the Prisma CLI and the schema, which the runtime
# image deliberately does not carry.
FROM source AS migrate
RUN npx prisma generate

# ---------------------------------------------------------------------------
FROM source AS api-build
RUN npx prisma generate
RUN npx nx build api

FROM node:22-bookworm-slim AS api-runtime
WORKDIR /app
# The query engine loads libssl at request time, not only during `prisma generate`.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=api-build /workspace/apps/api/.next/standalone ./
COPY --from=api-build /workspace/apps/api/.next/static ./apps/api/.next/static
COPY --from=api-build /workspace/apps/api/public ./apps/api/public
# STORAGE_ROOT is a named volume in the compose stacks. Docker seeds a fresh named volume from the
# image's directory, ownership included, so creating it as `node` here is what makes it writable
# once the container drops to that user.
RUN mkdir -p /data/storage && chown -R node:node /data/storage
# The official Node images ship a built-in unprivileged `node` user (uid 1000); the standalone
# server needs no root privileges and listens on 3000, so run as it rather than root.
USER node
# Next's standalone server binds to $HOSTNAME, and Docker sets HOSTNAME to the container id — so
# without this it listens on the container's own IP only and nothing inside the container can reach
# it on localhost. nginx still worked (it connects to `api:3000`), which made this look like a
# healthy deploy with a failing health check rather than a binding problem.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["node", "apps/api/server.js"]

# ---------------------------------------------------------------------------
FROM source AS web-build
RUN npx nx build web --configuration=production

FROM nginx:alpine AS web-runtime
# No `USER` line here, deliberately: the official nginx image handles privilege separation itself.
# Its master process starts as root only to bind port 80 (a privileged port) and read the config,
# then spawns every worker — the processes that actually handle requests — as the unprivileged
# `nginx` user declared by `user nginx;` in the image's /etc/nginx/nginx.conf. Forcing `USER nginx`
# would break the port-80 bind without adding isolation; the unprivileged variant of this image
# (nginxinc/nginx-unprivileged, which listens on 8080) is the supported way to run as non-root.
COPY --from=web-build /workspace/dist/apps/web/browser /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
