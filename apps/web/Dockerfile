FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm@9.0.0

# Dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Build shared
FROM deps AS shared-build
COPY packages/tsconfig/ packages/tsconfig/
COPY packages/shared/ packages/shared/
RUN node_modules/.bin/tsc -p packages/shared/tsconfig.json
RUN node_modules/.bin/prisma generate --schema=packages/shared/prisma/schema.prisma

# Build Web
FROM shared-build AS web-build
COPY apps/web/ apps/web/
COPY packages/tsconfig/ packages/tsconfig/
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN cd apps/web && ../../node_modules/.bin/next build

# Production image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=web-build /app/apps/web/.next/standalone ./
COPY --from=web-build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build /app/apps/web/public ./apps/web/public

# Next.js standalone usa CommonJS, mas o package.json raiz tem "type":"module"
# Substituímos por um package.json mínimo sem "type" para não quebrar o require()
RUN echo '{}' > /app/package.json

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "apps/web/server.js"]
