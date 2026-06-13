#!/bin/sh
set -e

node scripts/bootstrap-db.js
node scripts/seed.js || true
node src/server.js
