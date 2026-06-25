import { describe, it, expect } from 'vitest';
import { buildAnalysisContext, DEFAULT_PRIVACY } from './analysis';
import type { Holding, PrivacyFlags } from './types';

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

const HOLDINGS: Holding[] = [
  makeHolding({ id: 'a', symbol: 'AAPL', quantity: 10, currentPrice: 150, sector: 'Tech', region: 'US' }),
  makeHolding({ id: 'b', symbol: 'MSFT', quantity: 5, currentPrice: 400, sector: 'Tech', region: 'US' }),
  makeHolding({ id: 'c', symbol: 'CASH', assetClass: 'Cash', quantity: 1, currentPrice: 1000 }),
];

const PERMISSIVE: PrivacyFlags = {
  includeExactValues: true,
  includeQuantities: true,
  includeNotes: true,
};

describe('buildAnalysisContext — privacy defaults', () => {
  it('omits exact values, quantities, current price and total when defaults', () => {
    const ctx = buildAnalysisContext(HOLDINGS, 'USD', DEFAULT_PRIVACY);

    expect(ctx.totalPortfolioValue).toBeUndefined();
    expect(ctx.cashAndMoneyMarketValue).toBeUndefined();

    for (const h of ctx.holdings) {
      expect(h.quantity).toBeUndefined();
      expect(h.currentPrice).toBeUndefined();
      expect(h.marketValue).toBeUndefined();
    }
  });

  it('always includes symbol, asset class, currency and weight', () => {
    const ctx = buildAnalysisContext(HOLDINGS, 'USD', DEFAULT_PRIVACY);
    for (const h of ctx.holdings) {
      expect(h.symbol).toBeDefined();
      expect(h.assetClass).toBeDefined();
      expect(h.currency).toBe('USD');
      expect(typeof h.portfolioWeight).toBe('number');
    }
  });

  it('weights sum to ~1 within base-currency cohort', () => {
    const ctx = buildAnalysisContext(HOLDINGS, 'USD', DEFAULT_PRIVACY);
    const sum = ctx.holdings.reduce((s, h) => s + h.portfolioWeight, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});

describe('buildAnalysisContext — permissive privacy', () => {
  it('includes exact values, quantities, market values, and totals', () => {
    const ctx = buildAnalysisContext(HOLDINGS, 'USD', PERMISSIVE);

    expect(ctx.totalPortfolioValue).toBe(150 * 10 + 400 * 5 + 1000);
    expect(ctx.cashAndMoneyMarketValue).toBe(1000);

    const aapl = ctx.holdings.find((h) => h.symbol === 'AAPL')!;
    expect(aapl.quantity).toBe(10);
    expect(aapl.currentPrice).toBe(150);
    expect(aapl.marketValue).toBe(1500);
  });
});

describe('buildAnalysisContext — breakdowns', () => {
  it('breaks down by asset class, sector, region', () => {
    const ctx = buildAnalysisContext(HOLDINGS, 'USD', DEFAULT_PRIVACY);
    const classKeys = ctx.breakdowns.assetClass.map((b) => b.key).sort();
    expect(classKeys).toEqual(['Cash', 'Stock']);
    expect(ctx.breakdowns.sector.find((b) => b.key === 'Tech')?.value).toBe(1500 + 2000);
    expect(ctx.breakdowns.region.find((b) => b.key === 'US')?.value).toBe(1500 + 2000);
  });

  it('includes top 5 holdings ordered by market value', () => {
    const ctx = buildAnalysisContext(HOLDINGS, 'USD', DEFAULT_PRIVACY);
    expect(ctx.topHoldings[0].symbol).toBe('MSFT'); // 2000
    expect(ctx.topHoldings[1].symbol).toBe('AAPL'); // 1500
  });
});
