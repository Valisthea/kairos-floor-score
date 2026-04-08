#!/bin/bash
# Kairos Floor Score — OKX Onchain OS Integration Example
# Author: Valisthea / Kairos Lab
#
# Prerequisites:
#   - onchainos CLI installed (https://docs.okx.com/onchain-os)
#   - kairos-floor-score installed globally

# Score a trade using live data from onchainos
echo "=== Live BTC-USDT Analysis via Onchain OS ==="
kairos-floor-score analyze \
  --symbol BTC-USDT \
  --side long \
  --source onchainos \
  --chain solana \
  --funding-rate 0.0001

echo ""
echo "=== Live ETH-USDT Short Analysis ==="
kairos-floor-score analyze \
  --symbol ETH-USDT \
  --side short \
  --source onchainos \
  --chain ethereum \
  --funding-rate -0.0002

echo ""
echo "=== Batch scoring multiple pairs ==="
for PAIR in BTC-USDT ETH-USDT SOL-USDT; do
  echo "--- $PAIR ---"
  RESULT=$(kairos-floor-score analyze \
    --symbol "$PAIR" \
    --side long \
    --source onchainos \
    --chain solana 2>/dev/null)

  if [ $? -eq 0 ]; then
    RECOMMENDATION=$(echo "$RESULT" | grep -o '"recommendation":"[^"]*"' | cut -d'"' -f4)
    SCORE=$(echo "$RESULT" | grep -o '"score":[0-9.]*' | head -1 | cut -d: -f2)
    echo "  $PAIR: $RECOMMENDATION (score: $SCORE)"
  else
    echo "  $PAIR: ERROR - onchainos data unavailable"
  fi
done
