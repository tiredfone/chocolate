#!/bin/sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/main.js"
