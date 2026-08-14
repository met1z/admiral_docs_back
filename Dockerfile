# syntax = docker/dockerfile:1

ARG NODE_VERSION=22.14.0
ARG YARN_VERSION=4.14.1

FROM node:${NODE_VERSION}-slim AS base
LABEL fly_launch_runtime="NestJS"
WORKDIR /app

FROM base AS build
ENV NODE_ENV="development"

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3 && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable && \
    yarn set version ${YARN_VERSION}

COPY .yarnrc.yml package.json yarn.lock ./
RUN yarn install --immutable

COPY . .
RUN yarn run build

FROM base AS prod-deps
ENV NODE_ENV="production"

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3 && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable && \
    yarn set version ${YARN_VERSION}

COPY .yarnrc.yml package.json yarn.lock ./
RUN yarn workspaces focus -A --production

FROM base AS runtime
ENV NODE_ENV="production"

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main"]
