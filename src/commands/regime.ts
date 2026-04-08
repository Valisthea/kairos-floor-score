/**
 * Regime Command
 *
 * Standalone market regime detection from kline data.
 * Author: Valisthea / Kairos Lab
 */

import { Command } from 'commander';
import { detectRegime } from '../ml/regime.js';
import type { Kline } from '../types.js';

export const regimeCommand = new Command('regime')
  .description('Detect market regime from kline data')
  .requiredOption('--klines <json>', 'Klines as JSON array of {o,h,l,c,v} objects')
  .option('--output <format>', 'Output format: json or text', 'json')
  .action((opts) => {
    try {
      const klines: Kline[] = JSON.parse(opts.klines);

      if (!klines || klines.length < 5) {
        console.error('Error: at least 5 klines required');
        process.exit(1);
      }

      const result = detectRegime(klines);

      if (opts.output === 'text') {
        console.log(`\n  Market Regime Detection`);
        console.log(`  ${'─'.repeat(40)}`);
        console.log(`  Regime     : ${result.regime}`);
        console.log(`  Strength   : ${result.regimeStrength}/5`);
        console.log(`  Direction  : ${result.direction}`);
        console.log(`  Tradable   : ${result.tradable ? 'YES' : 'NO'}`);
        console.log(`  Volatility : ${result.volatilityRegime}`);
        console.log(`  ATR Ratio  : ${result.atrRatio}`);
        console.log(`  RSI        : ${result.rsi}`);
        console.log(`  Reasoning  : ${result.reasoning}`);
        console.log(`  ${'─'.repeat(40)}\n`);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (err) {
      console.error('Regime detection failed:', (err as Error).message);
      process.exit(1);
    }
  });
