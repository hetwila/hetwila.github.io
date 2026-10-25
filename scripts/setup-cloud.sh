#!/usr/bin/env bash
set -euo pipefail

cd /workspace/hetwila.github.io
cache_dir="/workspace/.cache/hetwila"
export PNPM_HOME="$cache_dir/pnpm"
export XDG_DATA_HOME="$cache_dir/data"
export XDG_CACHE_HOME="$cache_dir/cache"
export npm_config_cache="$cache_dir/npm"
export NUXT_TELEMETRY_DISABLED=1

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major !== 24 || minor < 15) throw new Error("This project requires Node.js 24.15+ in the Node 24 LTS line; see .node-version.")'
if [[ ! -f "$cache_dir/toolchain/node_modules/pnpm/bin/pnpm.cjs" ]] && [[ ! -f "$cache_dir/toolchain/node_modules/pnpm/bin/pnpm.mjs" ]]; then
  npm install --prefix "$cache_dir/toolchain" --ignore-scripts --no-audit --no-fund pnpm@11.25.0
fi
export PATH="$cache_dir/toolchain/node_modules/.bin:$PATH"
test "$(pnpm --version)" = "11.25.0"
pnpm install --frozen-lockfile
pnpm prepare:content
