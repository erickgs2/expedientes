# Node 22 on Debian: parts of the Nx toolchain declare `node >=22.13.0`, and the Angular build is
# the memory peak of a Pi deploy — not somewhere to also be fighting musl quirks.
FROM node:22-bookworm-slim AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY libs/shared/types/package.json libs/shared/types/
# Only the manifests so far: this layer, and the install below, stay cached across every commit
# that does not change a dependency. Copying the source first would rebuild npm ci every time.
# The cache mount keeps npm's package cache warm between builds too.
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npx nx build web --configuration=production

FROM nginx:alpine
# No `USER` line here, deliberately: the official nginx image handles privilege separation itself.
# Its master process starts as root only to bind port 80 (a privileged port) and read the config,
# then spawns every worker — the processes that actually handle requests — as the unprivileged
# `nginx` user declared by `user nginx;` in the image's /etc/nginx/nginx.conf. Forcing `USER nginx`
# would break the port-80 bind without adding isolation; the unprivileged variant of this image
# (nginxinc/nginx-unprivileged, which listens on 8080) is the supported way to run as non-root.
COPY --from=build /workspace/dist/apps/web/browser /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
