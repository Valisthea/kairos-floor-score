---
name: kairos-floor-score
description: >
  Institutional-grade ML trade scoring for AI agents. Use this skill when an agent
  needs to evaluate whether a trade setup is worth executing. Provides regime
  classification, microstructure analysis, confluence scoring, and a GO/REDUCE/REJECT
  recommendation backed by a gradient-boosted decision tree trained on real trade data.
  Trigger on: trade scoring, should I buy/sell, market analysis, regime detection,
  risk assessment, trade evaluation, entry quality, setup scoring, confluence check,
  microstructure analysis, liquidity check, VPIN, order flow, Uniswap pool analysis,
  Uniswap V3, score this pool, DEX trade scoring, AMM liquidity, pool depth check,
  Uniswap entry quality, ethereum pool, polygon pool, base pool, arbitrum pool.
license: MIT
metadata:
  author: kairos-lab
  version: "1.1.0"
  hackathon: "OKX Build X Hackathon April 2026"
  agent:
    requires:
      bins: ["kairos-floor-score"]
      optional: ["onchainos"]
---

# Kairos Floor Score

## When to Use

Invoke this skill whenever you need to determine the quality of a trade entry. Common triggers:

- "Should I go long/short on X?"
- "Score this trade setup"
- "What's the market regime right now?"
- "Is there enough liquidity to enter?"
- "Check confluence for this entry"
- "What's the VPIN / order flow saying?"
- "Evaluate this trade for risk"

## How to Call

### Full Trade Scoring

```bash
kairos-floor-score analyze \
  --symbol BTC-USDT \
  --side long \
  --klines '<json array of {o,h,l,c,v} candles>' \
  --funding-rate 0.0001 \
  --output json
```

The output JSON contains:
- `recommendation`: `GO` (score >= 0.55), `REDUCE` (>= 0.45), or `REJECT` (< 0.45)
- `score`: ML probability [0, 1]
- `confidence`: HIGH / MEDIUM / LOW
- `regime`: market regime classification with tradability assessment
- `confluence`: 5-group weighted confluence breakdown
- `microstructure`: Kyle Lambda, VPIN, order imbalance, spread

### Regime Detection Only

```bash
kairos-floor-score regime --klines '<json>'
```

### Microstructure Only

```bash
kairos-floor-score microstructure --klines '<json>'
```

### Health Check

```bash
kairos-floor-score health
```

## Interpreting Results

### Recommendation

| Value   | Score Range | Action |
|---------|-------------|--------|
| GO      | >= 0.55     | Execute the trade with normal sizing |
| REDUCE  | 0.45 - 0.55 | Trade with reduced size or wait for better setup |
| REJECT  | < 0.45      | Do not enter this trade |

### Regime

The regime classifier identifies 5 states: `trending_up`, `trending_down`, `ranging`, `volatile`, `dead`. Only trade when `tradable: true`.

### Confluence

5 factor groups are scored independently:
- **Trend** (25%): EMA cross, SMA position, multi-timeframe alignment
- **Momentum** (20%): RSI, ADX, MACD histogram
- **Volatility** (20%): ATR percentage, Bollinger bandwidth
- **Flow** (20%): Volume ratio, order imbalance
- **Sentiment** (15%): Funding rate, premium/discount

### Microstructure

- **VPIN > 0.7**: High probability of informed trading — caution
- **Kyle Lambda high**: Thin liquidity, expect slippage
- **Order Imbalance > 0.3**: Strong directional pressure

## Uniswap V3 Integration

Score a trade directly from a Uniswap V3 pool — no manual candle data needed:

```bash
# ETH-USDC 0.30% pool on Ethereum
kairos-floor-score analyze \
  --symbol ETH-USDC \
  --side long \
  --source uniswap \
  --pool 0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8 \
  --chain ethereum

# Any pool on Polygon, Base, Arbitrum, Optimism
kairos-floor-score analyze \
  --symbol MATIC-USDC \
  --side long \
  --source uniswap \
  --pool <pool-address> \
  --chain polygon
```

The Uniswap adapter fetches swap-aggregated OHLCV candles via `onchainos uniswap klines`, reads pool metadata (fee tier, token pair), and passes the data through the full 5-stage scoring pipeline.

Supported chains: `ethereum`, `polygon`, `base`, `arbitrum`, `optimism`

## Integration with OKX Onchain OS

If `onchainos` CLI is installed, data can be fetched directly from any supported chain:

```bash
kairos-floor-score analyze \
  --symbol BTC-USDT \
  --side long \
  --source onchainos \
  --chain ethereum
```

## Agent Workflow

1. Receive trade signal from upstream strategy
2. Call `kairos-floor-score analyze` with current market data
3. If recommendation is `GO`, proceed to position sizing
4. If `REDUCE`, cut position size by 50%
5. If `REJECT`, skip this trade entirely
6. Log the full score result for post-trade analysis
