#!/bin/sh
set -e
cd /app/apps/api
exec bun run src/index.ts
