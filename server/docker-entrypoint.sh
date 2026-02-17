#!/bin/sh
set -e

# Auto-generate JWT_SECRET if not set
if [ -z "$JWT_SECRET" ]; then
  SECRET_FILE="/app/data/.jwt_secret"
  if [ -f "$SECRET_FILE" ]; then
    export JWT_SECRET=$(cat "$SECRET_FILE")
    echo "Loaded JWT_SECRET from $SECRET_FILE"
  else
    export JWT_SECRET=$(openssl rand -hex 32)
    mkdir -p /app/data
    echo -n "$JWT_SECRET" > "$SECRET_FILE"
    echo "Generated new JWT_SECRET and saved to $SECRET_FILE"
  fi
fi

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting server..."
exec node dist/index.js
