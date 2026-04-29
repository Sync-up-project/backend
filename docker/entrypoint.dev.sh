#!/bin/sh
# 개발용 엔트리포인트.
# - package-lock.json / prisma/schema.prisma 해시를 node_modules 안에 캐시해 두고
#   바뀐 경우에만 `npm ci` / `prisma generate` 를 다시 돌립니다.
# - 변경이 없으면 곧바로 CMD 로 넘어가서 컨테이너 기동이 빨라요.

set -e

LOCK_FILE="package-lock.json"
SCHEMA_FILE="prisma/schema.prisma"

LOCK_HASH_FILE="/app/node_modules/.dev-lock-hash"
SCHEMA_HASH_FILE="/app/node_modules/.dev-schema-hash"

hash_of() {
  if [ -f "$1" ]; then
    sha1sum "$1" | awk '{print $1}'
  else
    echo "missing"
  fi
}

ensure_node_modules() {
  needs_install=0

  if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
    needs_install=1
  fi

  current_lock=$(hash_of "$LOCK_FILE")
  previous_lock=$(cat "$LOCK_HASH_FILE" 2>/dev/null || echo "none")
  if [ "$current_lock" != "$previous_lock" ]; then
    needs_install=1
  fi

  if [ "$needs_install" = "1" ]; then
    echo "[backend dev-entrypoint] installing dependencies..."
    if [ -f "$LOCK_FILE" ]; then
      npm ci --no-audit --no-fund
    else
      npm install --no-audit --no-fund
    fi
    mkdir -p "$(dirname "$LOCK_HASH_FILE")"
    echo "$current_lock" > "$LOCK_HASH_FILE"
  else
    echo "[backend dev-entrypoint] dependencies up-to-date, skipping install"
  fi
}

ensure_prisma_client() {
  if [ ! -f "$SCHEMA_FILE" ]; then
    return
  fi

  current_schema=$(hash_of "$SCHEMA_FILE")
  previous_schema=$(cat "$SCHEMA_HASH_FILE" 2>/dev/null || echo "none")

  if [ "$current_schema" != "$previous_schema" ] \
    || [ ! -d node_modules/.prisma/client ]; then
    echo "[backend dev-entrypoint] running prisma generate..."
    npx --no-install prisma generate
    mkdir -p "$(dirname "$SCHEMA_HASH_FILE")"
    echo "$current_schema" > "$SCHEMA_HASH_FILE"
  else
    echo "[backend dev-entrypoint] prisma client up-to-date"
  fi
}

ensure_node_modules
ensure_prisma_client

exec "$@"
