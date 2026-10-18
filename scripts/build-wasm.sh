#!/bin/sh
# Builds jitsuin-wasm from the sibling repo and writes the browser bindings to src/wasm/.
set -eu
ZCASH_REPO="${ZCASH_REPO:-../jitsuinfi-zcash}"
(cd "$ZCASH_REPO" && cargo build -p jitsuin-wasm --target wasm32-unknown-unknown --release)
wasm-bindgen --target web --out-dir src/wasm \
  "$ZCASH_REPO/target/wasm32-unknown-unknown/release/jitsuin_wasm.wasm"
echo "wasm bindings written to src/wasm/"
