import { describe, it, expect } from 'vitest';
import {
  computeMarketValue,
  computeCostBasis,
  computeUnrealizedPL,
  computeUnrealizedPLPercent,
  daysSince,
  isStale,
  STALE_THRESHOLD_DAYS,
  computeHoldingsWithValues,
  computePortfolioSummary,
  groupByAssetClass,
  buildPortfolioSnapshot,
} from './calculations';
import type { Holding, Portfolio } from './types';

const NOW = new Date().toISOString();

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 'h1',
    portfolioId: 'default',
    symbol: 'TEST',
    assetClass: 'Stock',
    quantity: 1,
    currentPrice: 100,
    currency: 'USD',
    asOfDate: '2024-01-01',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const DEFAULT_PORTFOLIO: Portfolio = {
  id: 'default',
  name: 'My Portfolio',
  baseCurrency: 'USD',
  createdAt: NOW,
  updatedAt: NOW,
};

// ---------------------------------------------------------------------------
// computeMarketValue
// ---------------------------------------------------------------------------

describe('computeMarketValue', () => {
  it('multiplies quantity by currentPrice', () => {
    expect(computeMarketValue(makeHolding({ quantity: 10, currentPrice: 200 }))).toBe(2000);
  });

  it('handles fractional quantities', () => {
    expect(computeMarketValue(makeHolding({ quantity: 0.5, currentPrice: 100 }))).toBe(50);
  });

  it('returns 0 for zero quantity', () => {
    expect(computeMarketValue(makeHolding({ quantity: 0, currentPrice: 500 }))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeCostBasis
// ---------------------------------------------------------------------------

describe('computeCostBasis', () => {
  it('returns null when averagePrice is absent', () => {
    expect(computeCostBasis(makeHolding({ averagePrice: undefined }))).toBeNull();
  });

  it('returns quantity × averagePrice when present', () => {
    expect(computeCostBasis(makeHolding({ quantity: 10, averagePrice: 150 }))).toBe(1500);
  });

  it('returns 0 for RSU grants (averagePrice = 0)', () => {
    expect(computeCostBasis(makeHolding({ quantity: 10, averagePrice: 0 }))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeUnrealizedPL
// ---------------------------------------------------------------------------

describe('computeUnrealizedPL', () => {
  it('returns null when averagePrice is absent', () => {
    expect(computeUnrealizedPL(makeHolding({ averagePrice: undefined }))).toBeNull();
  });

  it('returns positive P/L when current > average', () => {
    const h = makeHolding({ quantity: 10, averagePrice: 100, currentPrice: 120 });
    expect(computeUnrealizedPL(h)).toBe(200); // (120 - 100) * 10
  });

  it('returns negative P/L when current < average', () => {
    const h = makeHolding({ quantity: 10, averagePrice: 100, currentPrice: 80 });
    expect(computeUnrealizedPL(h)).toBe(-200); // (80 - 100) * 10
  });
});

// ---------------------------------------------------------------------------
// computeUnrealizedPLPercent
// ---------------------------------------------------------------------------

describe('computeUnrealizedPLPercent', () => {
  it('returns null when averagePrice is absent', () => {
    expect(computeUnrealizedPLPercent(makeHolding({ averagePrice: undefined }))).toBeNull();
  });

  it('returns null when costBasis is 0 (zero-cost RSU)', () => {
    expect(computeUnrealizedPLPercent(makeHolding({ quantity: 10, averagePrice: 0, currentPrice: 100 }))).toBeNull();
  });

  it('computes correct percentage', () => {
    const h = makeHolding({ quantity: 10, averagePrice: 100, currentPrice: 120 });
    expect(computeUnrealizedPLPercent(h)).toBeCloseTo(0.2, 5); // 20%
  });
});

// ---------------------------------------------------------------------------
// daysSince
// ---------------------------------------------------------------------------

describe('daysSince', () => {
  it('returns 0 when asOfDate equals today in UTC', () => {
    const today = new Date(Date.UTC(2024, 0, 8)); // 2024-01-08
    expect(daysSince('2024-01-08', today)).toBe(0);
  });

  it('returns correct days at UTC midnight boundary', () => {
    const today = new Date(Date.UTC(2024, 0, 8));
    expect(daysSince('2024-01-01', today)).toBe(7);
    expect(daysSince('2024-01-07', today)).toBe(1);
  });

  it('returns 7 for exactly 7 days ago', () => {
    const today = new Date(Date.UTC(2024, 0, 8));
    expect(daysSince('2024-01-01', today)).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// isStale
// ---------------------------------------------------------------------------

describe('isStale', () => {
  const today = new Date(Date.UTC(2024, 0, 9)); // 2024-01-09

  it('returns false when daysSince equals threshold', () => {
    // 2024-01-02 is 7 days before 2024-01-09
    expect(daysSince('2024-01-02', today)).toBe(7);
    expect(isStale('2024-01-02', 7, today)).toBe(false); // 7 is NOT > 7
  });

  it('returns true when daysSince exceeds threshold by 1', () => {
    // 2024-01-01 is 8 days before 2024-01-09
    expect(daysSince('2024-01-01', today)).toBe(8);
    expect(isStale('2024-01-01', 7, today)).toBe(true); // 8 > 7
  });

  it('uses STALE_THRESHOLD_DAYS = 7 as default', () => {
    expect(STALE_THRESHOLD_DAYS).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// computeHoldingsWithValues
// ---------------------------------------------------------------------------

describe('computeHoldingsWithValues', () => {
  it('attaches correct marketValue and weight for base-currency holdings', () => {
    const holdings = [
      makeHolding({ id: 'h1', symbol: 'AAPL', quantity: 10, currentPrice: 200, currency: 'USD' }),
      makeHolding({ id: 'h2', symbol: 'CASH', assetClass: 'Cash', quantity: 5000, currentPrice: 1, currency: 'USD' }),
    ];
    const result = computeHoldingsWithValues(holdings, 'USD');
    const total = 2000 + 5000; // 7000
    const h1 = result.find((h) => h.id === 'h1')!;
    const h2 = result.find((h) => h.id === 'h2')!;

    expect(h1.marketValue).toBe(2000);
    expect(h2.marketValue).toBe(5000);
    expect(h1.weight).toBeCloseTo(2000 / total, 5);
    expect(h2.weight).toBeCloseTo(5000 / total, 5);
    expect(h1.weight + h2.weight).toBeCloseTo(1, 5);
  });

  it('gives weight = 0 to foreign-currency holdings', () => {
    const holdings = [
      makeHolding({ id: 'h1', quantity: 10, currentPrice: 200, currency: 'USD' }),
      makeHolding({ id: 'h2', symbol: 'SAP', quantity: 5, currentPrice: 100, currency: 'EUR' }),
    ];
    const result = computeHoldingsWithValues(holdings, 'USD');
    const eur = result.find((h) => h.id === 'h2')!;
    expect(eur.weight).toBe(0);
    expect(eur.marketValue).toBe(500); // still computed, just excluded from weight
  });

  it('returns weight = 0 for all when base total is 0', () => {
    const holdings = [
      makeHolding({ id: 'h1', quantity: 5, currentPrice: 100, currency: 'EUR' }),
    ];
    const result = computeHoldingsWithValues(holdings, 'USD');
    expect(result[0].weight).toBe(0);
  });

  it('sets costBasis to null when averagePrice is absent', () => {
    const result = computeHoldingsWithValues([makeHolding({ averagePrice: undefined })], 'USD');
    expect(result[0].costBasis).toBeNull();
    expect(result[0].unrealizedPL).toBeNull();
    expect(result[0].unrealizedPLPercent).toBeNull();
  });

  it('computes costBasis, unrealizedPL, unrealizedPLPercent when averagePrice is set', () => {
    const h = makeHolding({ quantity: 10, averagePrice: 100, currentPrice: 120, currency: 'USD' });
    const result = computeHoldingsWithValues([h], 'USD');
    expect(result[0].costBasis).toBe(1000);
    expect(result[0].unrealizedPL).toBe(200);
    expect(result[0].unrealizedPLPercent).toBeCloseTo(0.2, 5);
  });

  it('isStale is false for Cash/MoneyMarket regardless of asOfDate', () => {
    const old = '2020-01-01'; // very old date
    const cash = makeHolding({ assetClass: 'Cash', asOfDate: old });
    const mm = makeHolding({ assetClass: 'MoneyMarket', asOfDate: old });
    const results = computeHoldingsWithValues([cash, mm], 'USD');
    expect(results[0].isStale).toBe(false);
    expect(results[1].isStale).toBe(false);
  });

  it('isStale is false for zero-quantity holdings', () => {
    const h = makeHolding({ quantity: 0, asOfDate: '2020-01-01' });
    const result = computeHoldingsWithValues([h], 'USD');
    expect(result[0].isStale).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computePortfolioSummary
// ---------------------------------------------------------------------------

describe('computePortfolioSummary', () => {
  it('computes baseCurrencyTotal and cashAndMoneyMarketValue correctly', () => {
    const holdings = [
      makeHolding({ id: 'h1', symbol: 'AAPL', assetClass: 'Stock', quantity: 10, currentPrice: 200, currency: 'USD' }),
      makeHolding({ id: 'h2', symbol: 'CASH', assetClass: 'Cash', quantity: 5000, currentPrice: 1, currency: 'USD' }),
    ];
    const summary = computePortfolioSummary(holdings, 'USD');
    expect(summary.baseCurrencyTotal).toBe(7000);
    expect(summary.cashAndMoneyMarketValue).toBe(5000);
    expect(summary.holdingCount).toBe(2);
  });

  it('splits totalsByCurrency for multi-currency portfolios', () => {
    const holdings = [
      makeHolding({ id: 'h1', symbol: 'AAPL', quantity: 10, currentPrice: 200, currency: 'USD' }),
      makeHolding({ id: 'h2', symbol: 'SAP', quantity: 5, currentPrice: 100, currency: 'EUR' }),
    ];
    const summary = computePortfolioSummary(holdings, 'USD');
    expect(summary.totalsByCurrency['USD']).toBe(2000);
    expect(summary.totalsByCurrency['EUR']).toBe(500);
    expect(summary.baseCurrencyTotal).toBe(2000); // EUR excluded
  });

  it('builds assetClassBreakdown from base-currency cohort only', () => {
    const holdings = [
      makeHolding({ id: 'h1', symbol: 'AAPL', assetClass: 'Stock', quantity: 10, currentPrice: 200, currency: 'USD' }),
      makeHolding({ id: 'h2', symbol: 'CASH', assetClass: 'Cash', quantity: 5000, currentPrice: 1, currency: 'USD' }),
      makeHolding({ id: 'h3', symbol: 'SAP', assetClass: 'Stock', quantity: 5, currentPrice: 100, currency: 'EUR' }),
    ];
    const summary = computePortfolioSummary(holdings, 'USD');
    const stockBreakdown = summary.assetClassBreakdown.find((b) => b.key === 'Stock');
    // SAP (EUR) should be excluded from breakdown
    expect(stockBreakdown?.value).toBe(2000);
  });

  it('totalCostBasis and totalUnrealizedPL exclude foreign-currency holdings', () => {
    const usd = makeHolding({ id: 'h1', currency: 'USD', averagePrice: 100, currentPrice: 110, quantity: 10 });
    const sgd = makeHolding({ id: 'h2', currency: 'SGD', averagePrice: 200, currentPrice: 220, quantity: 5, symbol: 'S68' });
    const summary = computePortfolioSummary([usd, sgd], 'USD');
    expect(summary.totalCostBasis).toBe(1000); // 10 × 100 (USD only)
    expect(summary.totalUnrealizedPL).toBe(100); // (110 − 100) × 10
  });

  it('totalUnrealizedPLPercent is null when totalCostBasis is 0', () => {
    const h = makeHolding({ averagePrice: 0, currentPrice: 100, quantity: 10 });
    const summary = computePortfolioSummary([h], 'USD');
    expect(summary.totalCostBasis).toBe(0);
    expect(summary.totalUnrealizedPLPercent).toBeNull();
  });

  it('missingCostBasisCount counts investment holdings with absent averagePrice', () => {
    const h1 = makeHolding({ id: 'h1', averagePrice: 100, currency: 'USD', assetClass: 'Stock' });
    const h2 = makeHolding({ id: 'h2', averagePrice: undefined, currency: 'USD', assetClass: 'Stock', symbol: 'B' });
    // Cash is excluded from missingCostBasisCount
    const h3 = makeHolding({ id: 'h3', averagePrice: undefined, currency: 'USD', assetClass: 'Cash', symbol: 'C' });
    const summary = computePortfolioSummary([h1, h2, h3], 'USD');
    expect(summary.missingCostBasisCount).toBe(1); // only h2
  });
});

// ---------------------------------------------------------------------------
// groupByAssetClass
// ---------------------------------------------------------------------------

describe('groupByAssetClass', () => {
  it('aggregates by asset class and sorts by value descending', () => {
    const holdings = computeHoldingsWithValues([
      makeHolding({ id: 'h1', assetClass: 'Stock', quantity: 10, currentPrice: 100, currency: 'USD' }),
      makeHolding({ id: 'h2', assetClass: 'Cash', quantity: 2000, currentPrice: 1, currency: 'USD' }),
      makeHolding({ id: 'h3', assetClass: 'Stock', quantity: 5, currentPrice: 100, currency: 'USD' }),
    ], 'USD');
    const breakdown = groupByAssetClass(holdings);
    expect(breakdown[0].key).toBe('Cash');
    expect(breakdown[0].value).toBe(2000);
    expect(breakdown[1].key).toBe('Stock');
    expect(breakdown[1].value).toBe(1500);
  });
});

// ---------------------------------------------------------------------------
// buildPortfolioSnapshot
// ---------------------------------------------------------------------------

describe('buildPortfolioSnapshot', () => {
  it('builds a snapshot with correct totalValue (base-currency only)', () => {
    const holdings = [
      makeHolding({ id: 'h1', quantity: 10, currentPrice: 200, currency: 'USD' }),
      makeHolding({ id: 'h2', symbol: 'CASH', assetClass: 'Cash', quantity: 5000, currentPrice: 1, currency: 'USD' }),
    ];
    const snap = buildPortfolioSnapshot(DEFAULT_PORTFOLIO, holdings, '2024-01-15');
    expect(snap.totalValue).toBe(7000);
    expect(snap.portfolioId).toBe('default');
    expect(snap.snapshotDate).toBe('2024-01-15');
    expect(snap.baseCurrency).toBe('USD');
  });

  it('excludes foreign-currency holdings from snapshot totalValue', () => {
    const holdings = [
      makeHolding({ id: 'h1', quantity: 10, currentPrice: 200, currency: 'USD' }),
      makeHolding({ id: 'h2', symbol: 'SAP', quantity: 5, currentPrice: 100, currency: 'EUR' }),
    ];
    const snap = buildPortfolioSnapshot(DEFAULT_PORTFOLIO, holdings, '2024-01-15');
    expect(snap.totalValue).toBe(2000); // EUR holding excluded
    expect(snap.holdings).toHaveLength(2); // but still listed in snapshot
  });

  it('uses today as snapshotDate when date omitted', () => {
    const snap = buildPortfolioSnapshot(DEFAULT_PORTFOLIO, [], undefined);
    expect(snap.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
