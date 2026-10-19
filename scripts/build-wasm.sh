#!/bin/sh
# Builds jitsuin-wasm from the sibling repo and writes the browser bindings to src/wasm/.
# src/wasm/ is committed: Vercel builds the site from git and has no Rust toolchain. Run this
# after jitsuin-wasm changes and commit the result; src/wasm/SOURCE records the zcash commit.
set -eu
ZCASH_REPO="${ZCASH_REPO:-../jitsuinfi-zcash}"
(cd "$ZCASH_REPO" && cargo build -p jitsuin-wasm --target wasm32-unknown-unknown --release)
wasm-bindgen --target web --out-dir src/wasm \
  "$ZCASH_REPO/target/wasm32-unknown-unknown/release/jitsuin_wasm.wasm"
(cd "$ZCASH_REPO" && git rev-parse HEAD) > src/wasm/SOURCE
echo "wasm bindings written to src/wasm/"
