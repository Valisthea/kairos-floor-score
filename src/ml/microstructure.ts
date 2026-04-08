/**
 * Microstructure Feature Engine
 *
 * Market microstructure analysis for liquidity and flow assessment.
 * Implements Kyle's Lambda, Amihud illiquidity, Roll spread,
 * VPIN (Volume-Synchronized Probability of Informed Trading),
 * and order imbalance metrics.
 */

import type { Kline, MicrostructureResult } from '../types.js';

/**
 * Kyle's Lambda: price impact measure.
 * Lambda = Cov(deltaP, V) / Var(V)
 * Higher lambda = more price impact per unit volume = lower liquidity.
 */
export function kyleLambda(priceChanges: number[], volumes: number[]): number {
  const n = Math.min(priceChanges.length, volumes.length);
  if (n < 5) return 0;

  const dP = priceChanges.slice(0, n);
  const V = volumes.slice(0, n);

  const meanDP = dP.reduce((a, b) => a + b, 0) / n;
  const meanV = V.reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  let varV = 0;
  for (let i = 0; i < n; i++) {
    cov += (dP[i] - meanDP) * (V[i] - meanV);
    varV += (V[i] - meanV) ** 2;
  }

  return varV > 0 ? (cov / n) / (varV / n) : 0;
}

/**
 * Amihud Illiquidity Ratio.
 * ILLIQ = (1/N) * sum(|return| / volume)
 * Higher value = less liquid market.
 */
export function amihudIlliquidity(returns: number[], volumes: number[]): number {
  const n = Math.min(returns.length, volumes.length);
  if (n < 3) return 0;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (volumes[i] > 0) {
      sum += Math.abs(returns[i]) / volumes[i];
    }
  }
  return sum / n;
}

/**
 * Roll Spread (implicit spread from price serial covariance).
 * Spread = 2 * sqrt(-Cov(deltaP_t, deltaP_{t-1}))
 * Negative covariance indicates a bid-ask bounce.
 */
export function rollSpread(priceChanges: number[]): number {
  if (priceChanges.length < 5) return 0;

  const n = priceChanges.length - 1;
  let covSum = 0;
  for (let i = 1; i < priceChanges.length; i++) {
    covSum += priceChanges[i] * priceChanges[i - 1];
  }
  const cov = covSum / n;

  return cov < 0 ? 2 * Math.sqrt(-cov) : 0;
}

/**
 * Compute all microstructure features from candle data.
 * Returns Kyle Lambda, Amihud illiquidity, Roll spread, VPIN, and order imbalance.
 */
export function computeMicrostructureFeatures(klines: Kline[]): MicrostructureResult {
  if (klines.length < 5) {
    return {
      kyleLambda: 0,
      amihudIlliq: 0,
      rollSpread: 0,
      vpin: 0,
      orderImbalance: 0,
      interpretation: 'insufficient data',
    };
  }

  const priceChanges = klines.slice(1).map((c, i) => c.c - klines[i].c);
  const returns = klines.slice(1).map((c, i) =>
    klines[i].c !== 0 ? (c.c - klines[i].c) / klines[i].c : 0
  );

  const signedVolumes = klines.map(c => {
    const direction = c.c >= c.o ? 1 : -1;
    return direction * c.v;
  });

  const dollarVolumes = klines.map(c => c.c * c.v);

  // VPIN: Volume-Synchronized Probability of Informed Trading
  const buyVol = klines.filter(c => c.c >= c.o).reduce((s, c) => s + c.v, 0);
  const sellVol = klines.filter(c => c.c < c.o).reduce((s, c) => s + c.v, 0);
  const totalVol = buyVol + sellVol;
  const vpin = totalVol > 0 ? Math.abs(buyVol - sellVol) / totalVol : 0;

  // Order imbalance: net buy pressure normalized
  const oi = totalVol > 0 ? (buyVol - sellVol) / totalVol : 0;

  const result: MicrostructureResult = {
    kyleLambda: round8(kyleLambda(priceChanges, signedVolumes.slice(1))),
    amihudIlliq: round8(amihudIlliquidity(returns, dollarVolumes.slice(1))),
    rollSpread: round8(rollSpread(priceChanges)),
    vpin: round4(vpin),
    orderImbalance: round4(oi),
    interpretation: '',
  };

  result.interpretation = interpretMicrostructure(result);
  return result;
}

/**
 * Produce a human-readable interpretation of microstructure signals.
 * Summarizes liquidity conditions, informed trading probability,
 * and directional flow pressure.
 */
export function interpretMicrostructure(m: MicrostructureResult): string {
  const signals: string[] = [];

  // Liquidity assessment via Kyle Lambda
  if (m.kyleLambda > 0.001) {
    signals.push('thin liquidity (high price impact)');
  } else if (m.kyleLambda > 0.0001) {
    signals.push('moderate liquidity');
  } else {
    signals.push('deep liquidity');
  }

  // Illiquidity check
  if (m.amihudIlliq > 1e-6) {
    signals.push('elevated illiquidity');
  }

  // Spread inference
  if (m.rollSpread > 0.5) {
    signals.push('wide implicit spread');
  } else if (m.rollSpread > 0.1) {
    signals.push('moderate spread');
  }

  // VPIN: informed trading detection
  if (m.vpin > 0.7) {
    signals.push('HIGH informed trading probability');
  } else if (m.vpin > 0.4) {
    signals.push('elevated informed flow');
  } else {
    signals.push('balanced flow');
  }

  // Order imbalance direction
  if (m.orderImbalance > 0.3) {
    signals.push('strong buy pressure');
  } else if (m.orderImbalance < -0.3) {
    signals.push('strong sell pressure');
  } else if (Math.abs(m.orderImbalance) < 0.1) {
    signals.push('neutral order flow');
  }

  return signals.join(' | ');
}

function round8(v: number): number {
  return Math.round(v * 1e8) / 1e8;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
