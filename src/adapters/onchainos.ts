/**
 * OKX Onchain OS Adapter
 *
 * Fetches market data via the onchainos CLI tool.
 * Graceful fallback if the CLI is not installed.
 * Author: Valisthea / Kairos Lab
 */

import { execSync } from 'node:child_process';
import type { Kline } from '../types.js';

/**
 * Check if onchainos CLI is available on PATH.
 */
export function isOnchainOSAvailable(): boolean {
  try {
    execSync('onchainos --version', { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch kline/candle data from OKX Onchain OS.
 *
 * Runs the onchainos CLI as a subprocess and parses the JSON output.
 * Throws an error with a helpful message if the CLI is not installed.
 */
export function fetchKlinesFromOnchainOS(
  symbol: string,
  chain: string = 'solana',
  interval: string = '15m',
  limit: number = 50,
): Kline[] {
  if (!isOnchainOSAvailable()) {
    throw new Error(
      'onchainos CLI not found. Install it from https://docs.okx.com/onchain-os ' +
      'or provide klines manually via --klines.',
    );
  }

  try {
    const cmd = `onchainos market klines --symbol ${symbol} --chain ${chain} --interval ${interval} --limit ${limit} --format json`;
    const output = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const data = JSON.parse(output.trim());

    if (Array.isArray(data)) {
      return data.map(normalizeKline);
    }

    if (data.klines && Array.isArray(data.klines)) {
      return data.klines.map(normalizeKline);
    }

    if (data.data && Array.isArray(data.data)) {
      return data.data.map(normalizeKline);
    }

    throw new Error('Unexpected onchainos output format');
  } catch (err) {
    if ((err as Error).message.includes('onchainos')) throw err;
    throw new Error(`onchainos query failed: ${(err as Error).message}`);
  }
}

/**
 * Normalize various kline formats into the standard Kline interface.
 */
function normalizeKline(raw: Record<string, unknown>): Kline {
  return {
    o: toNum(raw.o ?? raw.open ?? raw.Open ?? 0),
    h: toNum(raw.h ?? raw.high ?? raw.High ?? 0),
    l: toNum(raw.l ?? raw.low ?? raw.Low ?? 0),
    c: toNum(raw.c ?? raw.close ?? raw.Close ?? 0),
    v: toNum(raw.v ?? raw.volume ?? raw.Volume ?? 0),
    ts: toNum(raw.ts ?? raw.timestamp ?? raw.time ?? Date.now()),
  };
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}
