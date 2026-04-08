/**
 * Health Command
 *
 * Model health check — loads the GBDT model and displays diagnostics.
 * Author: Valisthea / Kairos Lab
 */

import { Command } from 'commander';
import { resolve } from 'node:path';
import { loadModel } from '../ml/gbdt.js';
import { getFeatureNames } from '../ml/features.js';

const DEFAULT_MODEL_PATH = resolve(
  import.meta.dirname ?? new URL('.', import.meta.url).pathname.slice(1),
  '../../models/default-model.json',
);

export const healthCommand = new Command('health')
  .description('Check model health and display diagnostics')
  .option('--model <path>', 'Path to GBDT model JSON', DEFAULT_MODEL_PATH)
  .action((opts) => {
    try {
      const model = loadModel(opts.model);
      const featureNames = getFeatureNames();

      const treeDepths = model.trees.map(countDepth);
      const totalNodes = model.trees.reduce((s, t) => s + countNodes(t), 0);
      const totalLeaves = model.trees.reduce((s, t) => s + countLeaves(t), 0);

      console.log(`\n  Kairos Floor Score — Model Health`);
      console.log(`  ${'─'.repeat(45)}`);
      console.log(`  Status         : OK`);
      console.log(`  Trees          : ${model.trees.length}`);
      console.log(`  Learning Rate  : ${model.learningRate}`);
      console.log(`  Base Score     : ${model.baseScore}`);
      console.log(`  Features       : ${model.featureNames.length}`);
      console.log(`  Total Nodes    : ${totalNodes}`);
      console.log(`  Total Leaves   : ${totalLeaves}`);
      console.log(`  Max Depth      : ${Math.max(...treeDepths)}`);
      console.log(`  Avg Depth      : ${(treeDepths.reduce((a, b) => a + b, 0) / treeDepths.length).toFixed(1)}`);
      console.log(`  Feature Match  : ${model.featureNames.length === featureNames.length ? 'YES' : 'MISMATCH'}`);
      console.log(`  ${'─'.repeat(45)}\n`);

      if (model.featureNames.length !== featureNames.length) {
        console.error(`  WARNING: Model has ${model.featureNames.length} features, expected ${featureNames.length}`);
        process.exit(1);
      }
    } catch (err) {
      console.error('Health check failed:', (err as Error).message);
      process.exit(1);
    }
  });

function countDepth(node: { left?: unknown; right?: unknown }): number {
  if (!node.left && !node.right) return 0;
  const leftDepth = node.left ? countDepth(node.left as { left?: unknown; right?: unknown }) : 0;
  const rightDepth = node.right ? countDepth(node.right as { left?: unknown; right?: unknown }) : 0;
  return 1 + Math.max(leftDepth, rightDepth);
}

function countNodes(node: { left?: unknown; right?: unknown }): number {
  let count = 1;
  if (node.left) count += countNodes(node.left as { left?: unknown; right?: unknown });
  if (node.right) count += countNodes(node.right as { left?: unknown; right?: unknown });
  return count;
}

function countLeaves(node: { left?: unknown; right?: unknown; value?: number }): number {
  if (node.value !== undefined && !node.left && !node.right) return 1;
  let count = 0;
  if (node.left) count += countLeaves(node.left as { left?: unknown; right?: unknown; value?: number });
  if (node.right) count += countLeaves(node.right as { left?: unknown; right?: unknown; value?: number });
  return count;
}
