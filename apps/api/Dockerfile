FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@9.0.0

# Dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Build shared
FROM deps AS shared-build
COPY packages/tsconfig/ packages/tsconfig/
COPY packages/shared/ packages/shared/
RUN node_modules/.bin/tsc -p packages/shared/tsconfig.json
RUN node_modules/.bin/prisma generate --schema=packages/shared/prisma/schema.prisma

# Build API
FROM shared-build AS api-build
COPY apps/api/ apps/api/
COPY packages/tsconfig/ packages/tsconfig/
RUN cd apps/api && ../../node_modules/.bin/nest build

# Production image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=api-build /app/apps/api/dist ./dist
COPY --from=api-build /app/apps/api/entrypoint.sh ./entrypoint.sh
COPY --from=api-build /app/packages/shared/client ./packages/shared/client
COPY --from=api-build /app/packages/shared/dist ./packages/shared/dist
COPY --from=api-build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=api-build /app/packages/shared/prisma ./packages/shared/prisma
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/packages/shared/node_modules ./packages/shared/node_modules

RUN chmod +x entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["./entrypoint.sh"]
