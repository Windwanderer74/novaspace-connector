#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_root="${SITES_RUNTIME_ROOT:-${project_root}/.sites-runtime}"
mkdir -p "${runtime_root}/npm-cache" "${runtime_root}/wrangler/logs"
export SITES_ENV_READY=1 SITES_PROJECT_ROOT="${project_root}"
export WRANGLER_WRITE_LOGS=false WRANGLER_LOG_PATH="${runtime_root}/wrangler/logs"
export MINIFLARE_REGISTRY_PATH="${runtime_root}/wrangler/registry"
export npm_config_cache="${runtime_root}/npm-cache"
export npm_config_audit=false npm_config_fund=false npm_config_update_notifier=false
if [[ "${1:-}" == "--" ]]; then shift; fi
[[ "$#" -gt 0 ]] || exit 64
cd "${project_root}"
exec "$@"
