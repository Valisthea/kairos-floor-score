# Agent Integration Flow

## Overview

This document describes how an autonomous trading agent integrates Kairos Floor Score
into its decision pipeline.

## Architecture

```
Signal Generator → Floor Score → Position Sizer → Execution Engine
```

## Step-by-Step Flow

### 1. Signal Reception

The upstream strategy module produces a trade signal:
```json
{
  "symbol": "BTC-USDT",
  "side": "long",
  "source": "momentum-breakout",
  "confidence": 0.72
}
```

### 2. Market Data Collection

The agent collects the most recent 20-50 OHLCV candles for the target pair.
If `onchainos` is available, data can be fetched automatically via `--source onchainos`.

### 3. Floor Score Evaluation

```bash
RESULT=$(kairos-floor-score analyze \
  --symbol BTC-USDT \
  --side long \
  --klines "$KLINES" \
  --funding-rate "$CURRENT_FUNDING" \
  --output json)
```

### 4. Decision Logic

```
RECOMMENDATION = RESULT.recommendation

if RECOMMENDATION == "GO":
    position_size = base_size * 1.0
    execute_trade()

elif RECOMMENDATION == "REDUCE":
    position_size = base_size * 0.5
    execute_trade()

elif RECOMMENDATION == "REJECT":
    skip_trade()
    log("Trade rejected by floor score")
```

### 5. Risk Checks

Before execution, verify:
- `regime.tradable == true` — market conditions support trading
- `microstructure.vpin < 0.7` — no extreme informed trading
- `confluence.groupsAligned >= 3` — minimum factor alignment
- `microstructure.kyleLambda` within acceptable slippage range

### 6. Post-Trade Logging

Store the full score result alongside the trade record for backtesting
and model retraining.

## Error Handling

- If `kairos-floor-score` is unreachable, default to REJECT
- If kline data is insufficient (< 5 candles), default to REJECT
- If model health check fails, halt all trading until resolved

## Retraining

Periodically retrain the GBDT model using accumulated trade outcomes:
1. Export trade history with labels (profitable = 1, unprofitable = 0)
2. Extract features using the same 32-dimension schema
3. Train new GBDT model
4. Validate AUC > 0.55 on holdout set
5. Replace `models/default-model.json`
6. Run `kairos-floor-score health` to verify
