#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${SITES_ENV_READY:-}" != "1" ]]; then exec bash "${script_dir}/sites-env.sh" -- bash "$0" "$@"; fi
command -v flock >/dev/null
command -v timeout >/dev/null
exec 9>"${SITES_PROJECT_ROOT}/.sites-runtime/install.lock"
flock -n 9 || { echo "An install is already running." >&2; exit 75; }
timeout --signal=TERM --kill-after=15s "${SITES_INSTALL_TIMEOUT:-8m}" npm ci --no-audit --no-fund
test -x "${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
