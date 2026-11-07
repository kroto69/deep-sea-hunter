#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
wasm=target/wasm32-unknown-unknown/release/deepfish_merchant_economy.wasm
RUSTFLAGS="${RUSTFLAGS:+$RUSTFLAGS }-C link-arg=--allow-undefined" "${CARGO:-cargo}" build --locked --target wasm32-unknown-unknown --release
node ../../node_modules/.bin/wasm-opt "$wasm" -o "$wasm.tmp" -O --llvm-memory-copy-fill-lowering --strip-target-features
mv "$wasm.tmp" "$wasm"
sha256sum "$wasm"
