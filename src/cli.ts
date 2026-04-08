#!/usr/bin/env node
/**
 * Kairos Floor Score — CLI Entrypoint
 *
 * Institutional-grade ML trade scoring for AI trading agents.
 * Author: Valisthea / Kairos Lab
 */

import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze.js';
import { regimeCommand } from './commands/regime.js';
import { microstructureCommand } from './commands/microstructure.js';
import { healthCommand } from './commands/health.js';

const program = new Command();
program
  .name('kairos-floor-score')
  .description('Institutional-grade ML trade scoring for AI trading agents')
  .version('1.0.0');

program.addCommand(analyzeCommand);
program.addCommand(regimeCommand);
program.addCommand(microstructureCommand);
program.addCommand(healthCommand);

program.parse();
