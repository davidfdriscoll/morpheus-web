#!/usr/bin/env bash
#
# Apply the one required Morpheus source fix to the submodule (idempotent).
#
# fixacc.c calls getsyll/getsyll2 with 3 args but they are defined with 2. Native
# C ignores the extra arg; WebAssembly TRAPS on the signature mismatch. The patch
# drops the always-ignored 3rd argument — behavior-preserving. Run before build.sh.
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MORPHEUS_DIR="${MORPHEUS_DIR:-$ROOT/morpheus}"
PATCH="$ROOT/wasm/patches/fixacc.patch"

[ -d "$MORPHEUS_DIR/src" ] || { echo "submodule not initialized at $MORPHEUS_DIR" >&2; exit 1; }
cd "$MORPHEUS_DIR"

if git apply --reverse --check "$PATCH" 2>/dev/null; then
  echo "fixacc patch already applied."
else
  git apply "$PATCH" && echo "fixacc patch applied."
fi
