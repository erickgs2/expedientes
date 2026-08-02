FROM node:20-alpine AS build
WORKDIR /workspace
COPY . .
RUN npm ci
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
