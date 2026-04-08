/**
 * Confluence Scoring Engine (V2)
 *
 * 5-group weighted confluence scoring system:
 *   - Trend:      0.25 (EMA cross, SMA position, multi-timeframe alignment)
 *   - Momentum:   0.20 (RSI, ADX, MACD histogram)
 *   - Volatility: 0.20 (ATR percentage, Bollinger bandwidth)
 *   - Flow:       0.20 (volume ratio, order imbalance)
 *   - Sentiment:  0.15 (funding rate, premium/discount)
 *
 * Each group produces a 0-1 score. The composite is the weighted sum.
 */

import type { Kline, ConfluenceResult, GroupScore } from '../types.js';

const WEIGHTS = {
  trend: 0.25,
  momentum: 0.20,
  volatility: 0.20,
  flow: 0.20,
  sentiment: 0.15,
} as const;

/**
 * Compute multi-factor confluence score for a given side and candle data.
 * Evaluates both long and short thesis, selects the stronger direction.
 */
export function computeConfluence(
  klines: Kline[],
  side: 'long' | 'short' | 'auto',
  regime: { atrRatio: number; rsi: number },
  fundingRate: number = 0,
): ConfluenceResult {
  if (klines.length < 5) {
    const empty: GroupScore = { score: 0, direction: 'neutral', weight: 0, details: 'no data' };
    return {
      trend: empty, momentum: empty, volatility: empty,
      flow: empty, sentiment: empty,
      composite: 0, direction: 'none', groupsAligned: 0,
    };
  }

  const closes = klines.map(k => k.c);
  const indicators = computeIndicators(klines);

  if (side === 'auto') {
    const longScores = computeForDirection(indicators, closes, klines, fundingRate, 'long');
    const shortScores = computeForDirection(indicators, closes, klines, fundingRate, 'short');
    const longComposite = weightedSum(longScores);
    const shortComposite = weightedSum(shortScores);

    const diff = Math.abs(longComposite - shortComposite);
    if (diff < 0.1) {
      const best = longComposite >= shortComposite ? longScores : shortScores;
      return buildResult(best, 'none', Math.max(longComposite, shortComposite));
    }
    if (longComposite > shortComposite) {
      return buildResult(longScores, 'long', longComposite);
    }
    return buildResult(shortScores, 'short', shortComposite);
  }

  const scores = computeForDirection(indicators, closes, klines, fundingRate, side);
  const composite = weightedSum(scores);
  return buildResult(scores, side === 'long' ? 'long' : 'short', composite);
}

interface Indicators {
  ema9: number;
  ema21: number;
  sma50: number;
  rsi: number;
  adx: number;
  macdHistogram: number;
  atrPct: number;
  bbWidth: number;
  price: number;
  volumeRatio: number;
}

interface DirectionScores {
  trend: GroupScore;
  momentum: GroupScore;
  volatility: GroupScore;
  flow: GroupScore;
  sentiment: GroupScore;
}

function computeIndicators(klines: Kline[]): Indicators {
  const closes = klines.map(k => k.c);
  const volumes = klines.map(k => k.v);
  const price = closes[closes.length - 1];

  return {
    ema9: ema(closes, 9),
    ema21: ema(closes, 21),
    sma50: sma(closes, Math.min(50, closes.length)),
    rsi: rsi(closes, 14),
    adx: adx(klines, 14),
    macdHistogram: macdHist(closes),
    atrPct: price > 0 ? (atr(klines, 14) / price) * 100 : 0,
    bbWidth: bollingerWidth(closes, 20, price),
    price,
    volumeRatio: volumeRatio(volumes),
  };
}

function computeForDirection(
  ind: Indicators,
  closes: number[],
  klines: Kline[],
  fundingRate: number,
  dir: 'long' | 'short',
): DirectionScores {
  return {
    trend: scoreTrend(ind, closes, dir),
    momentum: scoreMomentum(ind, dir),
    volatility: scoreVolatility(ind),
    flow: scoreFlow(ind, klines, dir),
    sentiment: scoreSentiment(fundingRate, dir),
  };
}

function weightedSum(scores: DirectionScores): number {
  return scores.trend.score * WEIGHTS.trend
       + scores.momentum.score * WEIGHTS.momentum
       + scores.volatility.score * WEIGHTS.volatility
       + scores.flow.score * WEIGHTS.flow
       + scores.sentiment.score * WEIGHTS.sentiment;
}

function buildResult(
  scores: DirectionScores,
  direction: 'long' | 'short' | 'none',
  composite: number,
): ConfluenceResult {
  let groupsAligned = 0;
  if (direction !== 'none') {
    for (const g of [scores.trend, scores.momentum, scores.flow, scores.sentiment]) {
      if (g.direction === direction && g.score > 0.4) groupsAligned++;
    }
    if (scores.volatility.score > 0.5) groupsAligned++;
  }

  return {
    trend: scores.trend,
    momentum: scores.momentum,
    volatility: scores.volatility,
    flow: scores.flow,
    sentiment: scores.sentiment,
    composite: Math.round(composite * 10000) / 10000,
    direction,
    groupsAligned,
  };
}

// -- Group 1: Trend (0.25) --

function scoreTrend(ind: Indicators, closes: number[], dir: 'long' | 'short'): GroupScore {
  let aligned = 0;
  const total = 4;
  const details: string[] = [];

  if (dir === 'long' && ind.ema9 > ind.ema21) { aligned++; details.push('EMA+'); }
  else if (dir === 'short' && ind.ema9 < ind.ema21) { aligned++; details.push('EMA-'); }

  if (dir === 'long' && ind.price > ind.sma50) { aligned++; details.push('SMA50+'); }
  else if (dir === 'short' && ind.price < ind.sma50) { aligned++; details.push('SMA50-'); }

  // Multi-timeframe: last 3 closes trending
  const last3 = closes.slice(-3);
  if (last3.length >= 3) {
    if (dir === 'long' && last3[2] > last3[0]) { aligned++; details.push('MTF+'); }
    else if (dir === 'short' && last3[2] < last3[0]) { aligned++; details.push('MTF-'); }
  }

  // Last 5 closes macro direction
  const last5 = closes.slice(-5);
  if (last5.length >= 5) {
    if (dir === 'long' && last5[4] > last5[0]) { aligned++; details.push('macro+'); }
    else if (dir === 'short' && last5[4] < last5[0]) { aligned++; details.push('macro-'); }
  }

  const score = Math.min(aligned / total, 1);
  return {
    score,
    direction: score > 0.4 ? dir : 'neutral',
    weight: WEIGHTS.trend,
    details: details.join(', ') || 'weak',
  };
}

// -- Group 2: Momentum (0.20) --

function scoreMomentum(ind: Indicators, dir: 'long' | 'short'): GroupScore {
  let score = 0;
  const details: string[] = [];

  if (dir === 'long') {
    if (ind.rsi >= 40 && ind.rsi <= 65) {
      score += 0.35 * (1 - Math.abs(ind.rsi - 52) / 25);
      details.push(`RSI${Math.round(ind.rsi)}`);
    }
  } else {
    if (ind.rsi >= 35 && ind.rsi <= 60) {
      score += 0.35 * (1 - Math.abs(ind.rsi - 48) / 25);
      details.push(`RSI${Math.round(ind.rsi)}`);
    }
  }

  if (ind.adx > 25) { score += 0.35; details.push(`ADX${Math.round(ind.adx)}`); }
  else if (ind.adx > 20) { score += 0.2; details.push(`ADX${Math.round(ind.adx)}w`); }
  if (ind.adx < 20) { score *= 0.5; details.push('weakTrend'); }

  if (dir === 'long' && ind.macdHistogram > 0) { score += 0.3; details.push('MACD+'); }
  else if (dir === 'short' && ind.macdHistogram < 0) { score += 0.3; details.push('MACD-'); }

  return {
    score: Math.min(score, 1),
    direction: score > 0.3 ? dir : 'neutral',
    weight: WEIGHTS.momentum,
    details: details.join(', ') || 'weak',
  };
}

// -- Group 3: Volatility (0.20) --

function scoreVolatility(ind: Indicators): GroupScore {
  let score: number;
  let details: string;

  if (ind.atrPct < 0.02) { score = 0.1; details = 'dead'; }
  else if (ind.atrPct < 0.05) { score = 0.5; details = 'low'; }
  else if (ind.atrPct < 0.15) { score = 1.0; details = 'ideal'; }
  else if (ind.atrPct < 0.3) { score = 0.6; details = 'high'; }
  else { score = 0.2; details = 'extreme'; }

  return {
    score,
    direction: 'neutral',
    weight: WEIGHTS.volatility,
    details: `ATR%=${ind.atrPct.toFixed(3)} BB=${ind.bbWidth.toFixed(2)} ${details}`,
  };
}

// -- Group 4: Flow (0.20) --

function scoreFlow(ind: Indicators, klines: Kline[], dir: 'long' | 'short'): GroupScore {
  let score = 0;
  const details: string[] = [];

  // Volume ratio scoring
  if (ind.volumeRatio > 1.5) { score += 0.4; details.push(`vol${ind.volumeRatio.toFixed(1)}x`); }
  else if (ind.volumeRatio > 0.8) { score += 0.2; details.push(`vol${ind.volumeRatio.toFixed(1)}`); }

  // Order imbalance from candle bodies
  const recent = klines.slice(-5);
  const buyCandles = recent.filter(k => k.c >= k.o).length;
  const sellCandles = recent.length - buyCandles;
  const imbalance = (buyCandles - sellCandles) / recent.length;

  if (dir === 'long' && imbalance > 0.2) { score += 0.3; details.push('buyPressure'); }
  else if (dir === 'short' && imbalance < -0.2) { score += 0.3; details.push('sellPressure'); }

  // Volume-weighted direction
  const buyVolume = recent.filter(k => k.c >= k.o).reduce((s, k) => s + k.v, 0);
  const sellVolume = recent.filter(k => k.c < k.o).reduce((s, k) => s + k.v, 0);
  const totalVol = buyVolume + sellVolume;
  if (totalVol > 0) {
    const vImbalance = (buyVolume - sellVolume) / totalVol;
    if (dir === 'long' && vImbalance > 0.15) { score += 0.3; details.push('volBuy'); }
    else if (dir === 'short' && vImbalance < -0.15) { score += 0.3; details.push('volSell'); }
  }

  return {
    score: Math.min(score, 1),
    direction: score > 0.3 ? dir : 'neutral',
    weight: WEIGHTS.flow,
    details: details.join(', ') || 'neutral',
  };
}

// -- Group 5: Sentiment (0.15) --

function scoreSentiment(fundingRate: number, dir: 'long' | 'short'): GroupScore {
  let score = 0;
  const details: string[] = [];

  if (fundingRate !== 0) {
    if (dir === 'long') {
      if (fundingRate < 0) { score += 0.5; details.push('fundNeg'); }
      if (fundingRate > 0.001) { score -= 0.3; details.push('fundCrowded'); }
    } else {
      if (fundingRate > 0) { score += 0.5; details.push('fundPos'); }
      if (fundingRate < -0.001) { score -= 0.3; details.push('shortCrowded'); }
    }
  } else {
    score = 0.3;
    details.push('noFunding');
  }

  score = Math.max(0, Math.min(score, 1));
  return {
    score,
    direction: score > 0.3 ? dir : 'neutral',
    weight: WEIGHTS.sentiment,
    details: details.join(', ') || 'neutral',
  };
}

// -- Technical indicator helpers --

function ema(closes: number[], period: number): number {
  if (closes.length === 0) return 0;
  let e = closes[0];
  const k = 2 / (period + 1);
  for (let i = 1; i < closes.length; i++) {
    e = closes[i] * k + e * (1 - k);
  }
  return e;
}

function sma(closes: number[], period: number): number {
  if (closes.length === 0) return 0;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function rsi(closes: number[], period: number): number {
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

function atr(klines: Kline[], period: number): number {
  if (klines.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const tr = Math.max(
      klines[i].h - klines[i].l,
      Math.abs(klines[i].h - klines[i - 1].c),
      Math.abs(klines[i].l - klines[i - 1].c),
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function adx(klines: Kline[], period: number): number {
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

function macdHist(closes: number[]): number {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12 - ema26;
  const signal = ema(closes.slice(-9), 9);
  return macdLine - (signal - closes[closes.length - 1]) * 0.001;
}

function bollingerWidth(closes: number[], period: number, price: number): number {
  if (closes.length < period || price === 0) return 0;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length);
  return ((mean + 2 * std) - (mean - 2 * std)) / price * 100;
}

function volumeRatio(volumes: number[]): number {
  if (volumes.length < 5) return 0.5;
  const recent = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const avg = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  return avg > 0 ? recent / avg : 0.5;
}
