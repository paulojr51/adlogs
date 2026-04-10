#!/bin/sh
set -e

echo "Running database migrations..."
node_modules/.bin/prisma migrate deploy --schema=packages/shared/prisma/schema.prisma

echo "Starting API..."
exec node dist/main
