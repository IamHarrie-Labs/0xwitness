import type { Snapshot, Kline } from "../receipt/types.ts";

// Seeded PRNG so a fixture is reproducible from its seed alone — the same
// property the receipts give a live run, applied to synthetic data.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS = [
  { symbol: "BTCUSDT", start: 64000, vol: 0.008, drift: 0.0012 },
  { symbol: "ETHUSDT", start: 3100, vol: 0.011, drift: -0.0004 },
  { symbol: "SOLUSDT", start: 148, vol: 0.017, drift: 0.0006 },
];

export function makeFixture(seed = 42): Snapshot {
  const rand = mulberry32(seed);
  const t0 = Date.UTC(2026, 8, 1, 0, 0, 0);   // fixed epoch: no clock in the fixture

  const symbols = SEEDS.map(({ symbol, start, vol, drift }) => {
    let price = start;
    const klines: Kline[] = [];
    for (let i = 0; i < 48; i++) {
      const open = price;
      price = open * (1 + drift + (rand() - 0.5) * 2 * vol);
      const high = Math.max(open, price) * (1 + rand() * vol * 0.4);
      const low = Math.min(open, price) * (1 - rand() * vol * 0.4);
      klines.push([
        t0 + i * 3_600_000,
        open.toFixed(2), high.toFixed(2), low.toFixed(2), price.toFixed(2),
        (1000 + rand() * 4000).toFixed(3),
      ]);
    }
    return {
      symbol,
      lastPrice: price.toFixed(2),
      klines1h: klines,
      fundingRate: ((rand() - 0.45) * 0.0004).toFixed(6),
      bestBid: (price * 0.9998).toFixed(2),
      bestAsk: (price * 1.0002).toFixed(2),
    };
  });

  return {
    capturedAt: new Date(t0 + 48 * 3_600_000).toISOString(),
    source: "fixture",
    symbols,
    account: {
      equityUsd: "1000.00",
      positions: [],
      recentPnl: [12.4, -8.1, 3.2],
    },
  };
}
