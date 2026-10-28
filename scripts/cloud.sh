#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cache_dir="${HETWILA_CACHE_DIR:-/workspace/.cache/hetwila}"
export PNPM_HOME="$cache_dir/pnpm"
export XDG_DATA_HOME="$cache_dir/data"
export XDG_CACHE_HOME="$cache_dir/cache"
export NUXT_TELEMETRY_DISABLED=1
export SUPABASE_HOME="${SUPABASE_HOME:-$cache_dir/supabase}"
export SUPABASE_TELEMETRY_DISABLED=1
if [[ -d "$cache_dir/toolchain/node_modules/.bin" ]]; then
  export PATH="$cache_dir/toolchain/node_modules/.bin:$PATH"
fi
cd "$repo_dir"
exec pnpm "$@"
