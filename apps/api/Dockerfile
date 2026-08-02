FROM node:20-alpine AS build
WORKDIR /workspace
COPY . .
RUN npm ci
RUN npx prisma generate
RUN npx nx build api

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /workspace/apps/api/.next/standalone ./
COPY --from=build /workspace/apps/api/.next/static ./apps/api/.next/static
COPY --from=build /workspace/apps/api/public ./apps/api/public
# STORAGE_ROOT is a named volume in docker-compose.prod.yml. Docker seeds a fresh named volume
# from the image's directory, ownership included, so creating it as `node` here is what makes it
# writable once the container drops to that user.
RUN mkdir -p /data/storage && chown -R node:node /data/storage
# node:20-alpine ships a built-in unprivileged `node` user (uid 1000); the standalone server needs
# no root privileges and listens on 3000, so run as it rather than root.
USER node
EXPOSE 3000
CMD ["node", "apps/api/server.js"]
