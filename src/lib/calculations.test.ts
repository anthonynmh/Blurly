import { describe, it, expect } from 'vitest';
import {
  computeMarketValue,
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
