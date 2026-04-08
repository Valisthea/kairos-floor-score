/**
 * Kairos Floor Score — Shared type definitions
 *
 * All interfaces used across the scoring pipeline:
 * candle data, feature vectors, model structures, and result types.
 */

/** Standard OHLCV candle */
export interface Kline {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  ts?: number;
}

/**
 * 32-dimensional feature vector for GBDT model input.
 * Covers candle dynamics, market context, decision quality,
 * trade parameters, technical indicators, microstructure, and session context.
 */
export interface FeatureVector {
  // Candle features (7)
  pre_momentum_3: number;
  pre_total_return: number;
  pre_volatility: number;
  pre_volume_spike: number;
  pre_body_ratio: number;
  pre_last_direction: number;
  pre_avg_volume: number;

  // Market context (3)
  funding_rate: number;
  volatility_1m: number;
  volume_spike: number;

  // Decision features (5)
  decision_approvals: number;
  decision_rejections: number;
  decision_warnings: number;
  decision_confidence_avg: number;
  decision_seventh_dissent: number;

  // Trade features (2)
  side: number;
  leverage: number;

  // Technical indicators (5)
  rsi: number;
  macd: number;
  adx: number;
  ema_cross: number;
  bb_position: number;

  // Microstructure features (5)
  micro_kyle_lambda: number;
  micro_amihud_illiq: number;
  micro_roll_spread: number;
  micro_vpin: number;
  micro_order_imbalance: number;

  // Session and temporal context (5)
  hour_of_day: number;
  day_of_week: number;
  consecutive_losses: number;
  consecutive_wins: number;
  drawdown_at_entry: number;
}

/** GBDT model prediction result */
export interface ScoreResult {
  score: number;
  probability: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  regime: RegimeResult;
  confluence: ConfluenceResult;
  microstructure: MicrostructureResult;
  features: number[];
  featureNames: string[];
  timestamp: number;
}

/** Market regime classification */
export interface RegimeResult {
  regime: 'trending_up' | 'trending_down' | 'ranging' | 'volatile' | 'dead';
  regimeStrength: 1 | 2 | 3 | 4 | 5;
  direction: 'long' | 'short' | 'both' | 'none';
  tradable: boolean;
  volatilityRegime: 'compressed' | 'normal' | 'expanding' | 'extreme';
  atrRatio: number;
  rsi: number;
  reasoning: string;
}

/** Microstructure analysis output */
export interface MicrostructureResult {
  kyleLambda: number;
  amihudIlliq: number;
  rollSpread: number;
  vpin: number;
  orderImbalance: number;
  interpretation: string;
}

/** Group-level score within confluence */
export interface GroupScore {
  score: number;
  direction: 'long' | 'short' | 'neutral';
  weight: number;
  details: string;
}

/** Multi-factor confluence scoring result */
export interface ConfluenceResult {
  trend: GroupScore;
  momentum: GroupScore;
  volatility: GroupScore;
  flow: GroupScore;
  sentiment: GroupScore;
  composite: number;
  direction: 'long' | 'short' | 'none';
  groupsAligned: number;
}

/** Metadata about the trained model */
export interface ModelMeta {
  trainedAt: string;
  nSamples: number;
  nTrees: number;
  features: string[];
  aucMean: number;
  featureImportance: Record<string, number>;
}

/** Single tree node in the GBDT ensemble */
export interface TreeNode {
  featureIdx?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  value?: number;
}

/** Serialized GBDT model */
export interface GBDTModel {
  trees: TreeNode[];
  learningRate: number;
  featureNames: string[];
  baseScore: number;
}

/** Options for the analyze command */
export interface AnalyzeOptions {
  klines?: string;
  source?: string;
  side?: 'long' | 'short';
  model?: string;
  fundingRate?: number;
  json?: boolean;
}
