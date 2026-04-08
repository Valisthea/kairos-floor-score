/**
 * Regime Detection Engine
 *
 * Pure math-based market regime classification using:
 * - ATR ratio (recent vs average volatility)
 * - EMA cross (9/21 trend direction)
 * - RSI (momentum and overbought/oversold)
 * - Volume ratio analysis
 *
 * No external dependencies. Deterministic output from candle data.
 */

import type { Kline, RegimeResult } from '../types.js';

/**
 * Detect the current market regime from candle data.
 * Classifies into: trending_up, trending_down, ranging, volatile, or dead.
 */
export function detectRegime(klines: Kline[]): RegimeResult {
  if (klines.length < 10) {
    return {
      regime: 'dead',
      regimeStrength: 1,
      direction: 'none',
      tradable: false,
      volatilityRegime: 'compressed',
      atrRatio: 0,
      rsi: 50,
      reasoning: 'insufficient data',
    };
  }

  const closes = klines.slice(-20).map(k => k.c).filter(v => v > 0);
  if (closes.length < 5) {
    return {
      regime: 'dead',
      regimeStrength: 1,
      direction: 'none',
      tradable: false,
      volatilityRegime: 'compressed',
      atrRatio: 0,
      rsi: 50,
      reasoning: 'insufficient price data',
    };
  }

  const ema9 = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);
  const price = closes[closes.length - 1];
  const atrRatio = computeATRRatio(klines);
  const rsi = computeRSI(closes, 14);
  const volRatio = computeVolumeRatio(klines);

  let regime: RegimeResult['regime'];
  let regimeStrength: 1 | 2 | 3 | 4 | 5;
  let direction: RegimeResult['direction'];
  let tradable: boolean;

  if (atrRatio < 0.4 && volRatio < 0.3) {
    regime = 'dead';
    regimeStrength = 1;
    direction = 'none';
    tradable = false;
  } else if (atrRatio > 2.0) {
    regime = 'volatile';
    regimeStrength = Math.min(5, Math.round(atrRatio * 2)) as 1 | 2 | 3 | 4 | 5;
    direction = 'both';
    tradable = false;
  } else if (ema9 > ema21 && price > ema21 && rsi > 45) {
    regime = 'trending_up';
    const str = (ema9 > ema21 ? 1 : 0) + (price > ema9 ? 1 : 0)
              + (rsi > 55 ? 1 : 0) + (volRatio > 0.7 ? 1 : 0) + (atrRatio > 0.8 ? 1 : 0);
    regimeStrength = Math.max(1, Math.min(5, str)) as 1 | 2 | 3 | 4 | 5;
    direction = 'long';
    tradable = regimeStrength >= 3;
  } else if (ema9 < ema21 && price < ema21 && rsi < 55) {
    regime = 'trending_down';
    const str = (ema9 < ema21 ? 1 : 0) + (price < ema9 ? 1 : 0)
              + (rsi < 45 ? 1 : 0) + (volRatio > 0.7 ? 1 : 0) + (atrRatio > 0.8 ? 1 : 0);
    regimeStrength = Math.max(1, Math.min(5, str)) as 1 | 2 | 3 | 4 | 5;
    direction = 'short';
    tradable = regimeStrength >= 3;
  } else {
    regime = 'ranging';
    const str = (Math.abs(rsi - 50) < 10 ? 1 : 0) + (atrRatio < 1.2 ? 1 : 0)
              + (volRatio > 0.5 ? 1 : 0) + 1;
    regimeStrength = Math.max(1, Math.min(5, str)) as 1 | 2 | 3 | 4 | 5;
    direction = 'both';
    tradable = regimeStrength >= 4;
  }

  let volatilityRegime: RegimeResult['volatilityRegime'] = 'normal';
  if (atrRatio < 0.5) volatilityRegime = 'compressed';
  else if (atrRatio > 1.5 && atrRatio <= 2.0) volatilityRegime = 'expanding';
  else if (atrRatio > 2.0) volatilityRegime = 'extreme';

  const reasoning =
    `ATR=${atrRatio.toFixed(2)} RSI=${rsi.toFixed(0)} ` +
    `EMA9${ema9 > ema21 ? '>' : '<'}EMA21 Vol=${volRatio.toFixed(2)}`;

  return {
    regime,
    regimeStrength,
    direction,
    tradable,
    volatilityRegime,
    atrRatio: Math.round(atrRatio * 1000) / 1000,
    rsi: Math.round(rsi * 10) / 10,
    reasoning,
  };
}

/** Exponential Moving Average */
function computeEMA(closes: number[], period: number): number {
  if (closes.length === 0) return 0;
  let e = closes[0];
  const k = 2 / (period + 1);
  for (let i = 1; i < closes.length; i++) {
    e = closes[i] * k + e * (1 - k);
  }
  return e;
}

/** Relative Strength Index */
function computeRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - (100 / (1 + (gains / period) / (losses / period)));
}

/**
 * ATR Ratio: recent average true range vs longer-term average.
 * Values > 1 indicate expanding volatility, < 1 contracting.
 */
function computeATRRatio(klines: Kline[]): number {
  if (klines.length < 20) return 1.0;
  const ranges = klines.slice(-20).map(k => k.h - k.l);
  const recent = ranges.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const avg = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  return avg > 0 ? recent / avg : 1.0;
}

/**
 * Volume ratio: recent volume compared to longer-term average.
 * Used to detect volume dying or surging conditions.
 */
function computeVolumeRatio(klines: Kline[]): number {
  if (klines.length < 10) return 0.5;
  const volumes = klines.slice(-20).map(k => k.v);
  const recent = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const avg = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  return avg > 0 ? recent / avg : 0.5;
}
