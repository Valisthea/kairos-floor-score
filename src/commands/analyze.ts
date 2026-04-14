/**
 * Analyze Command
 *
 * Full-pipeline trade scoring: features → GBDT → regime → microstructure → confluence → recommendation.
 * Author: Valisthea / Kairos Lab
 */

import { Command } from 'commander';
import { resolve } from 'node:path';
import { loadModel, predict } from '../ml/gbdt.js';
import { extractFeatures, getFeatureNames } from '../ml/features.js';
import { detectRegime } from '../ml/regime.js';
import { computeMicrostructureFeatures } from '../ml/microstructure.js';
import { computeConfluence } from '../ml/confluence.js';
import { fetchKlinesFromOnchainOS } from '../adapters/onchainos.js';
import { fetchKlinesFromUniswap, fetchUniswapPoolMeta, feeTierToSpreadBps } from '../adapters/uniswap.js';
import type { Kline, ScoreResult } from '../types.js';

const DEFAULT_MODEL_PATH = resolve(
  import.meta.dirname ?? new URL('.', import.meta.url).pathname.slice(1),
  '../../models/default-model.json',
);

export const analyzeCommand = new Command('analyze')
  .description('Score a trade setup using the full ML pipeline')
  .requiredOption('-s, --symbol <symbol>', 'Trading pair symbol (e.g., BTC-USDT)')
  .option('--side <side>', 'Trade direction: long or short', 'long')
  .option('--klines <json>', 'Klines as JSON array of {o,h,l,c,v} objects')
  .option('--funding-rate <rate>', 'Current funding rate', parseFloat, 0)
  .option('--source <source>', 'Data source: manual | onchainos | uniswap', 'manual')
  .option('--pool <address>', 'Uniswap V3 pool address (required for --source uniswap)')
  .option('--chain <chain>', 'Chain for onchainos/uniswap queries (ethereum | polygon | base | arbitrum)', 'ethereum')
  .option('--model <path>', 'Path to GBDT model JSON', DEFAULT_MODEL_PATH)
  .option('--output <format>', 'Output format: json or text', 'json')
  .action(async (opts) => {
    try {
      const side = opts.side === 'short' ? 'short' : 'long';
      let klines: Kline[];

      if (opts.klines) {
        klines = JSON.parse(opts.klines) as Kline[];
      } else if (opts.source === 'onchainos') {
        klines = fetchKlinesFromOnchainOS(opts.symbol, opts.chain);
      } else if (opts.source === 'uniswap') {
        if (!opts.pool) {
          console.error('Error: --pool <address> is required with --source uniswap');
          console.error('  Example: --pool 0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8 --chain ethereum');
          process.exit(1);
        }
        klines = fetchKlinesFromUniswap(opts.pool, opts.chain);

        // Enrich context with pool metadata when available
        const poolMeta = fetchUniswapPoolMeta(opts.pool, opts.chain);
        if (poolMeta) {
          const spreadBps = feeTierToSpreadBps(poolMeta.feeTier);
          process.stderr.write(
            `[kairos] Uniswap V3 pool ${opts.pool} — ` +
            `${poolMeta.token0}/${poolMeta.token1} · ` +
            `fee=${spreadBps}bps · chain=${opts.chain}\n`,
          );
        }
      } else {
        console.error('Error: provide --klines JSON or use --source onchainos|uniswap');
        process.exit(1);
      }

      if (!klines || klines.length < 5) {
        console.error('Error: at least 5 klines required');
        process.exit(1);
      }

      // Load model
      const model = loadModel(opts.model);

      // Pipeline stages
      const regime = detectRegime(klines);
      const microstructure = computeMicrostructureFeatures(klines);
      const confluence = computeConfluence(klines, side, regime, opts.fundingRate);
      const features = extractFeatures(klines, side, opts.fundingRate);
      const probability = predict(model, features);
      const featureNames = getFeatureNames();

      // Confidence from probability distance to 0.5
      const dist = Math.abs(probability - 0.5);
      const confidence = dist > 0.15 ? 'HIGH' : dist > 0.08 ? 'MEDIUM' : 'LOW';

      const result: ScoreResult = {
        score: Math.round(probability * 10000) / 10000,
        probability: Math.round(probability * 10000) / 10000,
        confidence,
        regime,
        confluence,
        microstructure,
        features,
        featureNames,
        timestamp: Date.now(),
      };

      // Recommendation
      const recommendation =
        probability >= 0.55 ? 'GO' :
        probability >= 0.45 ? 'REDUCE' : 'REJECT';

      const output = {
        symbol: opts.symbol,
        side,
        recommendation,
        ...result,
      };

      if (opts.output === 'text') {
        console.log(`\n  Kairos Floor Score — ${opts.symbol} ${side.toUpperCase()}`);
        console.log(`  ${'─'.repeat(50)}`);
        console.log(`  Recommendation : ${recommendation}`);
        console.log(`  Score          : ${result.score}`);
        console.log(`  Confidence     : ${result.confidence}`);
        console.log(`  Regime         : ${regime.regime} (strength ${regime.regimeStrength})`);
        console.log(`  Confluence     : ${confluence.composite} (${confluence.groupsAligned}/5 aligned)`);
        console.log(`  VPIN           : ${microstructure.vpin}`);
        console.log(`  Direction      : ${confluence.direction}`);
        console.log(`  ${'─'.repeat(50)}\n`);
      } else {
        console.log(JSON.stringify(output, null, 2));
      }
    } catch (err) {
      console.error('Analysis failed:', (err as Error).message);
      process.exit(1);
    }
  });
