#!/usr/bin/env bash
# Adam & Eva — launcher. Delegates to cli.py inside the module dir.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
exec python3 cli.py "$@"