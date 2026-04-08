/**
 * Microstructure Command
 *
 * Standalone microstructure analysis from kline data.
 * Author: Valisthea / Kairos Lab
 */

import { Command } from 'commander';
import { computeMicrostructureFeatures } from '../ml/microstructure.js';
import type { Kline } from '../types.js';

export const microstructureCommand = new Command('microstructure')
  .description('Analyze market microstructure from kline data')
  .requiredOption('--klines <json>', 'Klines as JSON array of {o,h,l,c,v} objects')
  .option('--output <format>', 'Output format: json or text', 'json')
  .action((opts) => {
    try {
      const klines: Kline[] = JSON.parse(opts.klines);

      if (!klines || klines.length < 5) {
        console.error('Error: at least 5 klines required');
        process.exit(1);
      }

      const result = computeMicrostructureFeatures(klines);

      if (opts.output === 'text') {
        console.log(`\n  Microstructure Analysis`);
        console.log(`  ${'─'.repeat(45)}`);
        console.log(`  Kyle Lambda      : ${result.kyleLambda}`);
        console.log(`  Amihud Illiq     : ${result.amihudIlliq}`);
        console.log(`  Roll Spread      : ${result.rollSpread}`);
        console.log(`  VPIN             : ${result.vpin}`);
        console.log(`  Order Imbalance  : ${result.orderImbalance}`);
        console.log(`  Interpretation   : ${result.interpretation}`);
        console.log(`  ${'─'.repeat(45)}\n`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (err) {
      console.error('Microstructure analysis failed:', (err as Error).message);
      process.exit(1);
    }
  });
