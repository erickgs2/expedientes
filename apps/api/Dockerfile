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
EXPOSE 3000
CMD ["node", "apps/api/server.js"]
