/**
 * GBDT Inference Engine
 *
 * Loads a serialized gradient-boosted decision tree model from JSON
 * and runs inference. No training logic — prediction only.
 *
 * Model format: { trees: TreeNode[], learningRate: number, featureNames: string[], baseScore: number }
 */

import { readFileSync } from 'node:fs';
import type { GBDTModel, TreeNode } from '../types.js';

/**
 * Load a GBDT model from a JSON file on disk.
 */
export function loadModel(path: string): GBDTModel {
  const raw = readFileSync(path, 'utf-8');
  const model = JSON.parse(raw) as GBDTModel;

  if (!model.trees || !Array.isArray(model.trees)) {
    throw new Error(`Invalid model: missing trees array`);
  }
  if (typeof model.learningRate !== 'number') {
    throw new Error(`Invalid model: missing learningRate`);
  }
  if (typeof model.baseScore !== 'number') {
    throw new Error(`Invalid model: missing baseScore`);
  }

  return model;
}

/**
 * Traverse a single decision tree to produce a leaf prediction.
 */
export function predictTree(node: TreeNode, features: number[]): number {
  if (node.value !== undefined) return node.value;
  if (node.featureIdx === undefined || node.threshold === undefined) return 0;
  return features[node.featureIdx] <= node.threshold
    ? predictTree(node.left!, features)
    : predictTree(node.right!, features);
}

/**
 * Logistic sigmoid activation.
 */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Run GBDT ensemble prediction on a feature vector.
 * Returns a probability in [0, 1] where higher = more likely profitable.
 */
export function predict(model: GBDTModel, features: number[]): number {
  const logOdds = Math.log(model.baseScore / (1 - model.baseScore + 1e-10));

  let score = logOdds;
  for (const tree of model.trees) {
    score += model.learningRate * predictTree(tree, features);
  }

  return sigmoid(score);
}
