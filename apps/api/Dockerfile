FROM node:20-alpine AS build
WORKDIR /workspace
COPY . .
RUN npm ci
RUN npx prisma generate
RUN npx nx build api

FROM node:20-alpine
WORKDIR /app
COPY --from=build /workspace/dist/apps/api ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/prisma ./prisma
EXPOSE 3000
CMD ["node", "server.js"]
