/**
 * Uniswap V3 Adapter
 *
 * Fetches pool OHLCV data from Uniswap V3 via the OKX Onchain OS CLI.
 * Converts swap-derived candles into the standard Kline format used by
 * the Kairos scoring pipeline.
 *
 * Supported chains: ethereum, polygon, base, arbitrum, optimism
 * Author: Valisthea / Kairos Lab
 */

import { execSync } from 'node:child_process';
import type { Kline } from '../types.js';

export interface UniswapPoolMeta {
  poolAddress: string;
  token0: string;
  token1: string;
  feeTier: number;       // e.g. 500 = 0.05%, 3000 = 0.30%, 10000 = 1%
  liquidity: string;
  sqrtPriceX96: string;
  tick: number;
}

/**
 * Fetch OHLCV klines for a Uniswap V3 pool via OKX Onchain OS.
 *
 * The onchainos CLI queries Uniswap V3 swap events and aggregates them
 * into candlestick data. Pool address is the canonical v3 pool address
 * (not the token pair addresses).
 *
 * @param poolAddress - Uniswap V3 pool contract address (0x...)
 * @param chain       - Target chain (ethereum | polygon | base | arbitrum | optimism)
 * @param interval    - Candle interval (1m | 5m | 15m | 1h | 4h | 1d)
 * @param limit       - Number of candles to fetch (default 50)
 */
export function fetchKlinesFromUniswap(
  poolAddress: string,
  chain: string = 'ethereum',
  interval: string = '15m',
  limit: number = 50,
): Kline[] {
  validatePoolAddress(poolAddress);

  const cmd = buildKlinesCommand(poolAddress, chain, interval, limit);

  let raw: string;
  try {
    raw = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (msg.includes('onchainos') || msg.includes('not found') || msg.includes('ENOENT')) {
      throw new Error(
        'onchainos CLI not found or not installed.\n' +
        'Install: https://docs.okx.com/onchain-os\n' +
        'Or pass candles manually via --klines.',
      );
    }
    throw new Error(`Uniswap data fetch failed: ${msg}`);
  }

  return parseKlinesOutput(raw.trim(), poolAddress);
}

/**
 * Fetch pool metadata (tokens, fee tier, current liquidity).
 * Useful for adjusting microstructure interpretation based on fee tier.
 *
 * Fee tier affects the effective spread: 500 bps → tighter, 10000 bps → wider.
 */
export function fetchUniswapPoolMeta(
  poolAddress: string,
  chain: string = 'ethereum',
): UniswapPoolMeta | null {
  validatePoolAddress(poolAddress);

  const cmd = `onchainos uniswap pool-info --pool ${poolAddress} --chain ${chain} --format json`;

  try {
    const raw = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return parsePoolMeta(raw.trim(), poolAddress);
  } catch {
    // Pool meta is optional — return null on failure, caller decides
    return null;
  }
}

/**
 * Convert a Uniswap V3 fee tier (in bps * 100) to an implied spread estimate.
 * Used to enrich the microstructure analysis when pool metadata is available.
 *
 * Uniswap fee tiers:
 *   100  → 0.01% (stable pairs)
 *   500  → 0.05% (pegged assets)
 *   3000 → 0.30% (standard)
 *   10000→ 1.00% (exotic/high-volatility)
 */
export function feeTierToSpreadBps(feeTier: number): number {
  return feeTier / 100; // bps
}

// ─── Internals ───────────────────────────────────────────────────────────────

function buildKlinesCommand(
  poolAddress: string,
  chain: string,
  interval: string,
  limit: number,
): string {
  return (
    `onchainos uniswap klines` +
    ` --pool ${poolAddress}` +
    ` --chain ${chain}` +
    ` --interval ${interval}` +
    ` --limit ${limit}` +
    ` --format json`
  );
}

function parseKlinesOutput(raw: string, poolAddress: string): Kline[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `onchainos returned non-JSON output for pool ${poolAddress}.\n` +
      `Raw: ${raw.slice(0, 200)}`,
    );
  }

  // Handle multiple response shapes from different onchainos versions
  let candles: unknown[];
  if (Array.isArray(data)) {
    candles = data;
  } else if (isObject(data) && Array.isArray((data as Record<string, unknown>).klines)) {
    candles = (data as Record<string, unknown>).klines as unknown[];
  } else if (isObject(data) && Array.isArray((data as Record<string, unknown>).data)) {
    candles = (data as Record<string, unknown>).data as unknown[];
  } else if (isObject(data) && Array.isArray((data as Record<string, unknown>).candles)) {
    candles = (data as Record<string, unknown>).candles as unknown[];
  } else {
    throw new Error(
      `Unexpected onchainos response shape for pool ${poolAddress}. ` +
      `Expected array or {klines/data/candles:[]}. Got: ${typeof data}`,
    );
  }

  if (candles.length === 0) {
    throw new Error(
      `onchainos returned 0 candles for pool ${poolAddress}. ` +
      `The pool may have low activity or the interval may be too fine.`,
    );
  }

  return candles.map((c, i) => normalizeCandle(c as Record<string, unknown>, i));
}

function parsePoolMeta(raw: string, poolAddress: string): UniswapPoolMeta | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      poolAddress,
      token0: String(data.token0 ?? data.token0Address ?? ''),
      token1: String(data.token1 ?? data.token1Address ?? ''),
      feeTier: Number(data.fee ?? data.feeTier ?? 3000),
      liquidity: String(data.liquidity ?? '0'),
      sqrtPriceX96: String(data.sqrtPriceX96 ?? '0'),
      tick: Number(data.tick ?? 0),
    };
  } catch {
    return null;
  }
}

function normalizeCandle(raw: Record<string, unknown>, index: number): Kline {
  return {
    o: toNum(raw.o ?? raw.open ?? raw.Open ?? 0),
    h: toNum(raw.h ?? raw.high ?? raw.High ?? 0),
    l: toNum(raw.l ?? raw.low ?? raw.Low ?? 0),
    c: toNum(raw.c ?? raw.close ?? raw.Close ?? 0),
    v: toNum(raw.v ?? raw.volume ?? raw.Volume ?? raw.volumeUSD ?? 0),
    ts: toNum(raw.ts ?? raw.timestamp ?? raw.time ?? raw.openTime ?? (Date.now() - index * 900_000)),
  };
}

function validatePoolAddress(addr: string): void {
  if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    throw new Error(
      `Invalid pool address: "${addr}". ` +
      `Must be a 0x-prefixed 20-byte hex address (e.g. 0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8).`,
    );
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }
  return 0;
}
