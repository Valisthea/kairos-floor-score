# Kairos Floor Score

Institutional-grade ML trade scoring engine for AI trading agents. Built for the OKX Build X Hackathon.

Kairos Floor Score evaluates trade setups through a multi-stage pipeline — regime detection, microstructure analysis, confluence scoring, and gradient-boosted decision tree inference — to produce a GO / REDUCE / REJECT recommendation that agents can act on immediately.

## Quick Start

```bash
npm install -g kairos-floor-score

# Score a trade setup
kairos-floor-score analyze \
  --symbol BTC-USDT \
  --side long \
  --klines '[{"o":64000,"h":64500,"l":63800,"c":64300,"v":1200},{"o":64300,"h":64800,"l":64100,"c":64600,"v":1500},{"o":64600,"h":65000,"l":64400,"c":64900,"v":1800},{"o":64900,"h":65200,"l":64700,"c":65100,"v":2100},{"o":65100,"h":65400,"l":64900,"c":65300,"v":1900},{"o":65300,"h":65600,"l":65100,"c":65500,"v":2200},{"o":65500,"h":65800,"l":65300,"c":65700,"v":2000},{"o":65700,"h":66000,"l":65500,"c":65900,"v":2400},{"o":65900,"h":66200,"l":65700,"c":66100,"v":2600},{"o":66100,"h":66400,"l":65900,"c":66300,"v":2300},{"o":66300,"h":66600,"l":66100,"c":66500,"v":2100},{"o":66500,"h":66800,"l":66300,"c":66700,"v":2500},{"o":66700,"h":67000,"l":66500,"c":66900,"v":2800},{"o":66900,"h":67200,"l":66700,"c":67100,"v":3000},{"o":67100,"h":67400,"l":66900,"c":67300,"v":2700}]' \
  --funding-rate 0.0001

# Regime detection only
kairos-floor-score regime --klines '<klines json>'

# Microstructure analysis
kairos-floor-score microstructure --klines '<klines json>'

# Model health check
kairos-floor-score health
```

## Output Format

```json
{
  "symbol": "BTC-USDT",
  "side": "long",
  "recommendation": "GO",
  "score": 0.6234,
  "probability": 0.6234,
  "confidence": "HIGH",
  "regime": {
    "regime": "trending_up",
    "regimeStrength": 4,
    "direction": "long",
    "tradable": true,
    "volatilityRegime": "normal",
    "atrRatio": 1.12,
    "rsi": 58.3,
    "reasoning": "ATR=1.12 RSI=58 EMA9>EMA21 Vol=1.05"
  },
  "confluence": {
    "composite": 0.72,
    "direction": "long",
    "groupsAligned": 4
  },
  "microstructure": {
    "kyleLambda": 0.00023,
    "vpin": 0.42,
    "orderImbalance": 0.31,
    "interpretation": "moderate liquidity | balanced flow | strong buy pressure"
  }
}
```

## Recommendation Thresholds

| Recommendation | Score    | Action |
|----------------|----------|--------|
| **GO**         | >= 0.55  | Execute trade with normal position sizing |
| **REDUCE**     | 0.45-0.55 | Reduce position size by 50% or wait for confirmation |
| **REJECT**     | < 0.45   | Do not execute this trade |

## Architecture

```
Input: OHLCV Candles + Funding Rate + Side
                    |
    +---------------+---------------+
    |               |               |
Regime          Microstructure   Confluence
Detection       Analysis         Scoring
    |               |               |
    +-------+-------+-------+-------+
            |               |
      Feature Extraction    |
      (32 dimensions)       |
            |               |
      GBDT Inference -------+
            |
    GO / REDUCE / REJECT
```

### Pipeline Stages

1. **Regime Detection** — Classifies the market into 5 states (trending_up, trending_down, ranging, volatile, dead) using ATR ratio, EMA crosses, RSI, and volume analysis. Only tradable regimes proceed.

2. **Microstructure Analysis** — Computes Kyle's Lambda (price impact), Amihud illiquidity, Roll spread, VPIN (informed trading probability), and order imbalance to assess execution conditions.

3. **Confluence Scoring** — Evaluates 5 weighted factor groups: Trend (25%), Momentum (20%), Volatility (20%), Flow (20%), Sentiment (15%). Each group independently scores and reports directional alignment.

4. **Feature Extraction** — Transforms raw data into a 32-dimensional numeric vector covering candle dynamics, market context, decision quality, trade parameters, technical indicators, microstructure metrics, and session context.

5. **GBDT Inference** — A gradient-boosted decision tree ensemble produces a probability score. The model uses logistic loss with sigmoid activation for binary classification (profitable vs. unprofitable setup).

## Integration with OKX Onchain OS

When `onchainos` CLI is available, Kairos Floor Score can fetch market data directly:

```bash
kairos-floor-score analyze \
  --symbol BTC-USDT \
  --side long \
  --source onchainos \
  --chain solana \
  --funding-rate 0.0001
```

This eliminates the need to pass raw kline data, making it suitable for fully automated agent workflows.

## Development

```bash
git clone https://github.com/Valisthea/kairos-floor-score.git
cd kairos-floor-score
npm install
npm run build
node dist/cli.js health
```

## About

Built by **Valisthea** at **Kairos Lab** for the OKX Build X Hackathon (April 2026).

Kairos Lab specializes in quantitative trading infrastructure and security research. Our systems are designed for institutional-grade reliability with zero external runtime dependencies.

## License

MIT
