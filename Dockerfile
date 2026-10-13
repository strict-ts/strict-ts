# The website (packages/site) as an image: built from the sources, then served as files by nginx on port 80.
# It is what a host that builds from the repository is given; nothing else of the project is in the image.
FROM node:22-bookworm AS build
WORKDIR /repo
COPY . .
# The pages say which commit they were built from: the clone says it, or the host that builds does.
ARG SOURCE_COMMIT=unknown
ENV SOURCE_COMMIT=$SOURCE_COMMIT
RUN corepack enable && pnpm install --frozen-lockfile && pnpm build && pnpm site

FROM nginx:1.29-alpine
COPY packages/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/packages/site/dist /usr/share/nginx/html
EXPOSE 80
