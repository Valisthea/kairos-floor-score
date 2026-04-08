/**
 * Feature Extractor
 *
 * Transforms raw candle data into a 32-dimensional numeric feature vector
 * suitable for GBDT model input. Covers:
 *   - Pre-trade candle dynamics (7 features)
 *   - Market context (3 features)
 *   - Decision quality defaults (5 features)
 *   - Trade parameters (2 features)
 *   - Technical indicators (5 features)
 *   - Microstructure metrics (5 features)
 *   - Session and temporal context (5 features)
 */

import type { Kline } from '../types.js';
import { computeMicrostructureFeatures } from './microstructure.js';

/**
 * Ordered list of all 32 feature names used by the model.
 * Must match the training schema exactly.
 */
export function getFeatureNames(): string[] {
  return [
    'pre_momentum_3', 'pre_total_return', 'pre_volatility',
    'pre_volume_spike', 'pre_body_ratio', 'pre_last_direction', 'pre_avg_volume',
    'funding_rate', 'volatility_1m', 'volume_spike',
    'decision_approvals', 'decision_rejections', 'decision_warnings',
    'decision_confidence_avg', 'decision_seventh_dissent',
    'side', 'leverage',
    'rsi', 'macd', 'adx', 'ema_cross', 'bb_position',
    'micro_kyle_lambda', 'micro_amihud_illiq', 'micro_roll_spread',
    'micro_vpin', 'micro_order_imbalance',
    'hour_of_day', 'day_of_week', 'consecutive_losses', 'consecutive_wins', 'drawdown_at_entry',
  ];
}

/**
 * Extract a 32-element numeric feature array from candle data and trade parameters.
 */
export function extractFeatures(
  klines: Kline[],
  side: 'long' | 'short',
  fundingRate: number = 0,
): number[] {
  const features: Record<string, number> = {};

  // -- Candle features (7) --
  const candleFeats = extractCandleFeatures(klines);
  Object.assign(features, candleFeats);

  // -- Market context (3) --
  features['funding_rate'] = fundingRate;
  features['volatility_1m'] = computeVolatility(klines);
  features['volume_spike'] = computeVolumeSpike(klines) ? 1 : 0;

  // -- Decision features (5) — defaults for standalone usage --
  features['decision_approvals'] = 3;
  features['decision_rejections'] = 0;
  features['decision_warnings'] = 1;
  features['decision_confidence_avg'] = 0.75;
  features['decision_seventh_dissent'] = 0;

  // -- Trade features (2) --
  features['side'] = side === 'long' ? 1 : -1;
  features['leverage'] = 5;

  // -- Technical indicators (5) --
  const closes = klines.map(k => k.c);
  features['rsi'] = computeRSI(closes, 14);
  features['macd'] = computeMACD(closes);
  features['adx'] = computeADX(klines, 14);
  const ema9 = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);
  features['ema_cross'] = ema9 >= ema21 ? 1 : -1;
  features['bb_position'] = computeBBPosition(closes, 20);

  // -- Microstructure features (5) --
  if (klines.length >= 5) {
    const micro = computeMicrostructureFeatures(klines);
    features['micro_kyle_lambda'] = micro.kyleLambda;
    features['micro_amihud_illiq'] = micro.amihudIlliq;
    features['micro_roll_spread'] = micro.rollSpread;
    features['micro_vpin'] = micro.vpin;
    features['micro_order_imbalance'] = micro.orderImbalance;
  }

  // -- Session + temporal context (5) --
  features['hour_of_day'] = new Date().getUTCHours();
  features['day_of_week'] = new Date().getUTCDay();
  features['consecutive_losses'] = 0;
  features['consecutive_wins'] = 0;
  features['drawdown_at_entry'] = 0;

  // Build ordered array matching getFeatureNames()
  const names = getFeatureNames();
  return names.map(n => features[n] ?? 0);
}

// -- Candle feature extraction helpers --

function extractCandleFeatures(klines: Kline[]): Record<string, number> {
  if (klines.length < 2) return {};

  const closes = klines.map(c => c.c);
  const volumes = klines.map(c => c.v);

  // Momentum: direction of last 3 candles
  const last3 = closes.slice(-3);
  const momentum = last3.length >= 2 && last3[0] !== 0
    ? (last3[last3.length - 1] - last3[0]) / last3[0]
    : 0;

  // Total return over window
  const totalReturn = closes[0] !== 0
    ? (closes[closes.length - 1] - closes[0]) / closes[0]
    : 0;

  // Return volatility (stdev)
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] !== 0) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  const mean = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1)
    : 0;
  const volatility = Math.sqrt(variance);

  // Volume spike
  const avgVol = volumes.length > 1
    ? volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1)
    : volumes[0] || 1;
  const volSpike = avgVol > 0 ? volumes[volumes.length - 1] / avgVol : 1;

  // Body ratio of last candle
  const last = klines[klines.length - 1];
  const bodySize = Math.abs(last.c - last.o);
  const candleRange = last.h - last.l;
  const bodyRatio = candleRange > 0 ? bodySize / candleRange : 0;

  // Direction of last candle
  const lastDirection = last.c >= last.o ? 1 : -1;

  return {
    'pre_momentum_3': momentum,
    'pre_total_return': totalReturn,
    'pre_volatility': volatility,
    'pre_volume_spike': volSpike,
    'pre_body_ratio': bodyRatio,
    'pre_last_direction': lastDirection,
    'pre_avg_volume': avgVol,
  };
}

function computeVolatility(klines: Kline[]): number {
  if (klines.length < 3) return 0;
  const closes = klines.map(k => k.c);
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] !== 0) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  return Math.sqrt(returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length);
}

function computeVolumeSpike(klines: Kline[]): boolean {
  if (klines.length < 3) return false;
  const volumes = klines.map(k => k.v);
  const avg = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
  return avg > 0 && volumes[volumes.length - 1] > avg * 2;
}

function computeEMA(closes: number[], period: number): number {
  if (closes.length === 0) return 0;
  let e = closes[0];
  const k = 2 / (period + 1);
  for (let i = 1; i < closes.length; i++) {
    e = closes[i] * k + e * (1 - k);
  }
  return e;
}

function computeRSI(closes: number[], period: number): number {
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

function computeMACD(closes: number[]): number {
  return computeEMA(closes, 12) - computeEMA(closes, 26);
}

function computeADX(klines: Kline[], period: number): number {
  if (klines.length < period + 1) return 15;
  let plusDMSum = 0;
  let minusDMSum = 0;
  let trSum = 0;

  for (let i = klines.length - period; i < klines.length; i++) {
    const upMove = klines[i].h - klines[i - 1].h;
    const downMove = klines[i - 1].l - klines[i].l;
    if (upMove > downMove && upMove > 0) plusDMSum += upMove;
    if (downMove > upMove && downMove > 0) minusDMSum += downMove;
    const tr = Math.max(
      klines[i].h - klines[i].l,
      Math.abs(klines[i].h - klines[i - 1].c),
      Math.abs(klines[i].l - klines[i - 1].c),
    );
    trSum += tr;
  }

  if (trSum === 0) return 15;
  const plusDI = (plusDMSum / trSum) * 100;
  const minusDI = (minusDMSum / trSum) * 100;
  const diSum = plusDI + minusDI;
  return diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 15;
}

function computeBBPosition(closes: number[], period: number): number {
  if (closes.length < period) return 0.5;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length);
  if (std === 0) return 0.5;
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  const range = upper - lower;
  return range > 0 ? (closes[closes.length - 1] - lower) / range : 0.5;
}
