#!/usr/bin/env bash
# Deploy the Deep Sea Hunter merchant contract to NEAR Testnet.
#
# Usage:
#   scripts/deploy-contract.sh --contract-id <new-contract>.testnet \
#     --owner-id <owner>.testnet --merchant-id <desk>.testnet \
#     --treasury-id <treasury>.testnet [--fund-near 5] [--yes]
#
# What it does, in order:
#   1. Checks prerequisites: cargo + wasm32 target, near-cli, node +
#      wasm-opt, and the two key files (contract account for the deploy,
#      owner account for funding).
#   2. Runs the contract unit tests, then builds the WASM with
#      contracts/merchant/build-wasm.sh and prints its SHA-256.
#   3. Asks for confirmation, then deploys with `near deploy` and
#      initFunction `new` (owner / merchant desk / treasury must be
#      three distinct accounts; max_trade defaults to 1000 NEAR).
#      With --upgrade, deploys the WASM only (no initFunction `new`) over
#      the existing contract — for a v3 code upgrade over live v2 state.
#      Only use it after the Borsh checklist in docs/DEPLOYMENT.md §3 and
#      contracts/merchant/README.md passes; the standing guidance prefers
#      a fresh deploy, because v3 adds settlement_key/used_receipts fields.
#   4. Runs `near state` afterwards and prints the explorer link so the
#      deploy transaction hash can be recorded from the log (no post-deploy
#      code check — the no-code check runs before deploy).
#   5. With --fund-near N, funds the on-chain treasury (owner-only
#      `fund_treasury`, a paid call) after a second confirmation.
#   6. Prints the exact .env / Render values to set afterwards.
#
# Paid calls need the owner's explicit approval: the script asks before
# every paid step (unless --yes is passed by the owner for an attended
# run). It never deploys, funds, or initializes on its own.
#
# HONEST LIMIT: this script has never been run end-to-end — this repo's
# sandbox has no near-cli and no Testnet accounts. Read it before
# running; near-cli flag names differ between versions, so if a call
# fails, check `near deploy --help` / `near call --help` on yours and
# report the difference back.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTRACT_ID=""; OWNER_ID=""; MERCHANT_ID=""; TREASURY_ID=""
FUND_NEAR=""; YES=0; UPGRADE=0
MAX_TRADE="1000000000000000000000000"  # 1000 NEAR in yoctoNEAR
NAME="Deep Sea Hunter Merchant"; SYMBOL="DSH"
WASM="contracts/merchant/target/wasm32-unknown-unknown/release/deepfish_merchant_economy.wasm"

usage() {
  sed -n '2,/^set -euo pipefail/p' "$0" | sed 's/^# \?//'
  echo "Flags: --contract-id, --owner-id, --merchant-id, --treasury-id (all required)"
  echo "       --fund-near N   fund the treasury with N NEAR after deploy (optional)"
  echo "       --upgrade       deploy code only, no init (see header; Borsh check first)"
  echo "       --yes           skip the confirmation prompts (owner-attended runs only)"
  echo "       --help          show this text"
}

confirm() {
  if [ "$YES" = 1 ]; then return 0; fi
  printf '%s [y/N] ' "$1"
  read -r answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ]
}

while [ $# -gt 0 ]; do
  case "$1" in
    --contract-id) CONTRACT_ID="$2"; shift 2 ;;
    --owner-id) OWNER_ID="$2"; shift 2 ;;
    --merchant-id) MERCHANT_ID="$2"; shift 2 ;;
    --treasury-id) TREASURY_ID="$2"; shift 2 ;;
    --fund-near) FUND_NEAR="$2"; shift 2 ;;
    --upgrade) UPGRADE=1; shift ;;
    --yes) YES=1; shift ;;
    --help) usage; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; usage >&2; exit 2 ;;
  esac
done

for var in CONTRACT_ID OWNER_ID MERCHANT_ID TREASURY_ID; do
  if [ -z "${!var}" ]; then flag="--${var,,}"; echo "Missing required ${flag//_/-} (see --help)" >&2; exit 2; fi
done
case "$CONTRACT_ID" in *.testnet) ;; *) echo "CONTRACT_ID must be a .testnet account (this game is Testnet-only)" >&2; exit 2 ;; esac
if [ "$OWNER_ID" = "$MERCHANT_ID" ] || [ "$OWNER_ID" = "$TREASURY_ID" ] || [ "$MERCHANT_ID" = "$TREASURY_ID" ]; then
  echo "owner / merchant / treasury must be three distinct accounts (contract new() requirement)" >&2; exit 2
fi
if [ "${#NAME}" -gt 50 ]; then echo "name must be <= 50 chars" >&2; exit 2; fi
if [ "${#SYMBOL}" -gt 10 ]; then echo "symbol must be <= 10 chars" >&2; exit 2; fi
if [ -n "$FUND_NEAR" ]; then
  [[ "$FUND_NEAR" =~ ^[0-9]+(\.[0-9]+)?$ ]] || { echo "--fund-near must be a positive number of NEAR (e.g. 5)" >&2; exit 2; }
fi

echo "== Prerequisites =="
command -v cargo >/dev/null || { echo "cargo not found — install Rust 1.99+ first" >&2; exit 1; }
if command -v rustup >/dev/null; then
  rustup target list --installed 2>/dev/null | grep -q wasm32-unknown-unknown \
    || { echo "wasm32-unknown-unknown target missing — run: rustup target add wasm32-unknown-unknown" >&2; exit 1; }
fi
command -v near >/dev/null || { echo "near-cli not found — install it first: npm i -g near-cli" >&2; exit 1; }
near --version
command -v node >/dev/null || { echo "node not found — needed for wasm-opt" >&2; exit 1; }
[ -x node_modules/.bin/wasm-opt ] || { echo "wasm-opt not found — run: npm ci" >&2; exit 1; }
[ -f "$HOME/.near-credentials/testnet/$CONTRACT_ID.json" ] \
  || { echo "No key file for the contract account: $HOME/.near-credentials/testnet/$CONTRACT_ID.json — run: near login (as $CONTRACT_ID)" >&2; exit 1; }
if [ -n "$FUND_NEAR" ] && [ ! -f "$HOME/.near-credentials/testnet/$OWNER_ID.json" ]; then
  echo "No key file for the owner account: $HOME/.near-credentials/testnet/$OWNER_ID.json — run: near login (as $OWNER_ID)" >&2; exit 1
fi

echo "== Contract tests (debug only; never --release) =="
cargo test --manifest-path contracts/merchant/Cargo.toml --lib -- --test-threads=1

echo "== Build WASM =="
contracts/merchant/build-wasm.sh
[ -f "$WASM" ] || { echo "Build did not produce $WASM" >&2; exit 1; }
sha256sum "$WASM"

echo "== Account state before deploy =="
if near state "$CONTRACT_ID" > /tmp/dsh-deploy-state.txt 2>/tmp/dsh-deploy-state.err; then
  if grep -q '11111111111111111111111111111111' /tmp/dsh-deploy-state.txt; then
    echo "Account exists and carries no code yet (fresh deploy)."
  else
    echo "WARNING: the account already carries code — this is a REDEPLOY."
    echo "Read the Borsh note in docs/DEPLOYMENT.md §3 and contracts/merchant/README.md first: redeploying over live state can corrupt it."
  fi
else
  echo "Could not read $CONTRACT_ID with 'near state' — the account may not exist yet." >&2
  echo "Create it first (Testnet faucet / wallet), then re-run." >&2
  exit 1
fi

echo "== Deploy plan =="
echo "  contract:  $CONTRACT_ID"
echo "  owner:     $OWNER_ID"
echo "  merchant:  $MERCHANT_ID"
echo "  treasury:  $TREASURY_ID"
echo "  max_trade: $MAX_TRADE yoctoNEAR (1000 NEAR)"
echo "  name:      $NAME"
echo "  symbol:    $SYMBOL"
echo "  wasm:      $WASM"
confirm "Deploy this contract (paid transaction)?" || { echo "Aborted."; exit 1; }

LOG=$(mktemp /tmp/dsh-deploy-XXXXXX.log)
echo "Deploy log: $LOG"
if [ "$UPGRADE" = 1 ]; then
  echo "UPGRADE MODE: code only, no init — live state is preserved. Never run initFunction new on an existing contract."
  confirm "Upgrade $CONTRACT_ID with the new WASM (state preserved, no re-init)?" || { echo "Aborted."; exit 1; }
  near deploy --accountId "$CONTRACT_ID" --wasmFile "$WASM" 2>&1 | tee "$LOG" \
    || { echo "Deploy failed — near-cli flags differ between versions; check: near deploy --help" >&2; echo "Full output kept in $LOG" >&2; exit 1; }
else
  INIT_ARGS=$(printf '{"owner_id":"%s","merchant_id":"%s","treasury_id":"%s","max_trade":"%s","name":"%s","symbol":"%s"}' \
    "$OWNER_ID" "$MERCHANT_ID" "$TREASURY_ID" "$MAX_TRADE" "$NAME" "$SYMBOL")
  near deploy --accountId "$CONTRACT_ID" --wasmFile "$WASM" --initFunction new --initArgs "$INIT_ARGS" 2>&1 | tee "$LOG" \
    || { echo "Deploy failed — near-cli flags differ between versions; check: near deploy --help" >&2; echo "Full output kept in $LOG" >&2; exit 1; }
fi

echo "== Verify =="
near state "$CONTRACT_ID"
echo "Record the deploy transaction hash from the log above ($LOG)."
echo "Explorer: https://testnet.nearblocks.io/accounts/$CONTRACT_ID"

if [ -n "$FUND_NEAR" ]; then
  echo "== Fund treasury =="
  if confirm "Fund the on-chain treasury with $FUND_NEAR NEAR from $OWNER_ID (paid call, owner-only)?"; then
    near call "$CONTRACT_ID" fund_treasury '{}' --accountId "$OWNER_ID" --deposit "$FUND_NEAR" \
      || { echo "fund_treasury failed — check: near call --help" >&2; exit 1; }
  else
    echo "Skipped funding. Fund later with: near call $CONTRACT_ID fund_treasury '{}' --accountId $OWNER_ID --deposit $FUND_NEAR"
  fi
fi

cat <<EOF

== Done. Set these values ==
.env (API host) and the Render dashboard:
  NEAR_MERCHANT_CONTRACT_ID=$CONTRACT_ID
  NEAR_MERCHANT_OWNER_ID=$OWNER_ID
  AUTO_MINT_ENABLED=true   (only if the owner key file is on the API host)

Next steps (see docs/DEPLOYMENT.md §4-§7):
  - Run the API with SETTLEMENT_SIGNING_KEY set, then register the
    settlement key once: GET /api/near/settlement-key for the pubkey,
    then call set_settlement_key on $CONTRACT_ID as $OWNER_ID.
  - Record the deploy transaction hash + code hash in
    docs/ONCHAIN_ECONOMY_PROOF.md (a claim without a hash does not count).
EOF
