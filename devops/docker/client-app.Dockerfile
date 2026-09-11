# SocietyHub client-app image (nginx serving Vite build)
# Prefer Azure Static Web Apps in staging/prod for cost; use this image for all-in Container Apps.
#   docker build -f devops/docker/client-app.Dockerfile -t societyhub-client-app:local .

FROM oven/bun:1.3-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
COPY package.json bun.lock turbo.json tsconfig.base.json ./
# Every workspace manifest in bun.lock must be present, or --frozen-lockfile
# sees a changed workspace set and fails — even for workspaces this image never builds.
COPY apps/client-app/package.json apps/client-app/
COPY apps/manage/package.json apps/manage/
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/
COPY packages/validation/package.json packages/validation/
COPY packages/auth/package.json packages/auth/
COPY packages/sdk/package.json packages/sdk/
COPY packages/ui/package.json packages/ui/
RUN bun install --frozen-lockfile
COPY apps/client-app apps/client-app
COPY packages packages
RUN bunx turbo run build --filter=@society-hub/client-app

FROM nginx:1.27-alpine AS runtime
COPY devops/docker/nginx-client-app.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client-app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
