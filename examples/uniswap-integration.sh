#!/bin/bash
# Kairos Floor Score — Uniswap V3 Integration Examples
# Author: Valisthea / Kairos Lab
#
# Requires onchainos CLI: https://docs.okx.com/onchain-os
# Usage: bash examples/uniswap-integration.sh

set -euo pipefail

echo "=== Kairos Floor Score × Uniswap V3 ==="
echo ""

# ─── Ethereum: ETH-USDC 0.30% pool ───────────────────────────────────────────
echo "--- ETH-USDC (Ethereum · 0.30% fee tier) ---"
kairos-floor-score analyze \
  --symbol ETH-USDC \
  --side long \
  --source uniswap \
  --pool 0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8 \
  --chain ethereum \
  --output text

echo ""

# ─── Ethereum: WBTC-USDC 0.30% pool ─────────────────────────────────────────
echo "--- WBTC-USDC (Ethereum · 0.30% fee tier) ---"
kairos-floor-score analyze \
  --symbol WBTC-USDC \
  --side long \
  --source uniswap \
  --pool 0x99ac8ca7087fa4a2a1fb6357269965a2014abc35 \
  --chain ethereum \
  --output text

echo ""

# ─── Base: ETH-USDC pool ──────────────────────────────────────────────────────
echo "--- ETH-USDC (Base) ---"
kairos-floor-score analyze \
  --symbol ETH-USDC \
  --side long \
  --source uniswap \
  --pool 0xd0b53d9277642d899df5c87a3966a349a798f224 \
  --chain base \
  --output text

echo ""

# ─── Regime + Microstructure only (no full ML score) ─────────────────────────
echo "--- Regime-only for Polygon MATIC-USDC ---"
# For regime/microstructure commands, still use --klines (or pipe from onchainos)
# Full uniswap source is only available on the analyze command
echo "(Use 'analyze --source uniswap' for full pool scoring)"

echo ""
echo "=== Done ==="
