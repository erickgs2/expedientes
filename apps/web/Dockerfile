FROM node:20-alpine AS build
WORKDIR /workspace
COPY . .
RUN npm ci
RUN npx nx build web --configuration=production

FROM nginx:alpine
COPY --from=build /workspace/dist/apps/web/browser /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
