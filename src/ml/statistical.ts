/**
 * Statistical Validation
 *
 * Bootstrap AUC confidence intervals for model evaluation.
 * Provides statistical rigor around model performance estimates.
 */

/**
 * Compute AUC-ROC using the Wilcoxon-Mann-Whitney statistic.
 * Counts concordant and tied pairs between positive and negative examples.
 */
export function computeAUC(yTrue: number[], yScore: number[]): number {
  const pos = yTrue
    .map((v, i) => ({ score: yScore[i], label: v }))
    .filter(x => x.label === 1);
  const neg = yTrue
    .map((v, i) => ({ score: yScore[i], label: v }))
    .filter(x => x.label === 0);

  if (pos.length === 0 || neg.length === 0) return 0.5;

  let concordant = 0;
  let tied = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (p.score > n.score) concordant++;
      else if (p.score === n.score) tied += 0.5;
    }
  }

  return (concordant + tied) / (pos.length * neg.length);
}

/**
 * Compute AUC-ROC with bootstrap confidence intervals.
 *
 * Resamples the prediction set with replacement to estimate
 * the distribution of AUC values. Returns mean, 95% CI, and
 * whether the model is statistically better than random (AUC > 0.5).
 */
export function bootstrapAUC(
  yTrue: number[],
  yScore: number[],
  nBootstrap: number = 500,
  alpha: number = 0.05,
): {
  mean: number;
  ciLower: number;
  ciUpper: number;
  isSignificant: boolean;
  std: number;
} {
  if (yTrue.length < 10) {
    return { mean: 0.5, ciLower: 0, ciUpper: 1, isSignificant: false, std: 0 };
  }

  const aucs: number[] = [];
  const n = yTrue.length;

  for (let b = 0; b < nBootstrap; b++) {
    const indices: number[] = [];
    for (let i = 0; i < n; i++) {
      indices.push(Math.floor(Math.random() * n));
    }

    const bTrue = indices.map(i => yTrue[i]);
    const bScore = indices.map(i => yScore[i]);

    const hasPos = bTrue.some(v => v === 1);
    const hasNeg = bTrue.some(v => v === 0);
    if (!hasPos || !hasNeg) continue;

    aucs.push(computeAUC(bTrue, bScore));
  }

  if (aucs.length < 50) {
    return { mean: computeAUC(yTrue, yScore), ciLower: 0, ciUpper: 1, isSignificant: false, std: 0 };
  }

  aucs.sort((a, b) => a - b);
  const mean = aucs.reduce((a, b) => a + b, 0) / aucs.length;
  const lowerIdx = Math.floor(aucs.length * (alpha / 2));
  const upperIdx = Math.floor(aucs.length * (1 - alpha / 2));
  const ciLower = aucs[lowerIdx];
  const ciUpper = aucs[upperIdx];

  const variance = aucs.reduce((sum, v) => sum + (v - mean) ** 2, 0) / aucs.length;
  const std = Math.sqrt(variance);

  return {
    mean: Math.round(mean * 10000) / 10000,
    ciLower: Math.round(ciLower * 10000) / 10000,
    ciUpper: Math.round(ciUpper * 10000) / 10000,
    isSignificant: ciLower > 0.5,
    std: Math.round(std * 10000) / 10000,
  };
}
