#!/bin/bash
# Kairos Floor Score — Basic Usage Example
# Author: Valisthea / Kairos Lab

# Sample klines: 15 candles of BTC trending upward
KLINES='[
  {"o":64000,"h":64500,"l":63800,"c":64300,"v":1200},
  {"o":64300,"h":64800,"l":64100,"c":64600,"v":1500},
  {"o":64600,"h":65000,"l":64400,"c":64900,"v":1800},
  {"o":64900,"h":65200,"l":64700,"c":65100,"v":2100},
  {"o":65100,"h":65400,"l":64900,"c":65300,"v":1900},
  {"o":65300,"h":65600,"l":65100,"c":65500,"v":2200},
  {"o":65500,"h":65800,"l":65300,"c":65700,"v":2000},
  {"o":65700,"h":66000,"l":65500,"c":65900,"v":2400},
  {"o":65900,"h":66200,"l":65700,"c":66100,"v":2600},
  {"o":66100,"h":66400,"l":65900,"c":66300,"v":2300},
  {"o":66300,"h":66600,"l":66100,"c":66500,"v":2100},
  {"o":66500,"h":66800,"l":66300,"c":66700,"v":2500},
  {"o":66700,"h":67000,"l":66500,"c":66900,"v":2800},
  {"o":66900,"h":67200,"l":66700,"c":67100,"v":3000},
  {"o":67100,"h":67400,"l":66900,"c":67300,"v":2700}
]'

echo "=== Full Analysis (JSON) ==="
kairos-floor-score analyze \
  --symbol BTC-USDT \
  --side long \
  --klines "$KLINES" \
  --funding-rate 0.0001

echo ""
echo "=== Full Analysis (Text) ==="
kairos-floor-score analyze \
  --symbol BTC-USDT \
  --side long \
  --klines "$KLINES" \
  --funding-rate 0.0001 \
  --output text

echo ""
echo "=== Regime Detection ==="
kairos-floor-score regime --klines "$KLINES"

echo ""
echo "=== Microstructure Analysis ==="
kairos-floor-score microstructure --klines "$KLINES"

echo ""
echo "=== Model Health ==="
kairos-floor-score health
