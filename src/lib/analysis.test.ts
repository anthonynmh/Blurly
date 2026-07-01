import { describe, it, expect } from 'vitest';
import { buildAnalysisContext, DEFAULT_PRIVACY } from './analysis';
import type {
  Holding,
  InvestmentStrategy,
  PrivacyFlags,
  StrategyCashReservation,
  StrategyMilestone,
} from './types';

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

// ---------------------------------------------------------------------------
// Strategy reservations propagate into analysis context
// ---------------------------------------------------------------------------

const STRATEGY: InvestmentStrategy = {
  investorPersonality: 'hybrid',
  createdAt: NOW,
  updatedAt: NOW,
};

const MILESTONE: StrategyMilestone = {
  id: 'm1',
  label: 'House deposit',
  targetDate: '2030-01-01',
  targetAmount: 50_000,
  targetCurrency: 'USD',
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

const CASH_HOLDING: Holding = {
  id: 'cash',
  portfolioId: 'default',
  symbol: 'CSOP',
  assetClass: 'Cash',
  quantity: 1,
  currentPrice: 40_000,
  currency: 'USD',
  asOfDate: '2024-01-01',
  createdAt: NOW,
  updatedAt: NOW,
};

const RESERVATION: StrategyCashReservation = {
  id: 'r1',
  holdingId: 'cash',
  milestoneId: 'm1',
  amount: 20_000,
  currency: 'USD',
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

describe('buildAnalysisContext — strategy reservations', () => {
  it('includes reservation summaries under permissive privacy', () => {
    const ctx = buildAnalysisContext(
      [CASH_HOLDING],
      'USD',
      PERMISSIVE,
      undefined,
      STRATEGY,
      [MILESTONE],
      [RESERVATION],
      undefined,
    );
    expect(ctx.strategy).toBeDefined();
    const m = ctx.strategy!.milestones[0];
    expect(m.reservations).toHaveLength(1);
    expect(m.reservations![0].amount).toBe(20_000);
    expect(m.reservations![0].holdingSymbol).toBe('CSOP');
    expect(m.totalReservedInTargetCurrency).toBe(20_000);
    expect(ctx.strategy!.cashSplit).toBeDefined();
    expect(ctx.strategy!.cashSplit!.totalCashAndMoneyMarket).toBe(40_000);
    expect(ctx.strategy!.cashSplit!.totalReserved).toBe(20_000);
    expect(ctx.strategy!.cashSplit!.estimatedCashDrag).toBe(20_000);
  });

  it('hides absolute reservation amounts under default privacy but keeps metadata', () => {
    const ctx = buildAnalysisContext(
      [CASH_HOLDING],
      'USD',
      DEFAULT_PRIVACY,
      undefined,
      STRATEGY,
      [MILESTONE],
      [RESERVATION],
      undefined,
    );
    const m = ctx.strategy!.milestones[0];
    expect(m.reservations![0].amount).toBeUndefined();
    expect(m.reservations![0].currency).toBe('USD');
    expect(m.reservations![0].holdingSymbol).toBe('CSOP');
    expect(m.totalReservedInTargetCurrency).toBeUndefined();
    expect(ctx.strategy!.cashSplit!.totalCashAndMoneyMarket).toBeUndefined();
    expect(ctx.strategy!.cashSplit!.totalReserved).toBeUndefined();
  });

  it('sets fxMissing when a cross-currency reservation lacks an FX rate', () => {
    const sgdMilestone: StrategyMilestone = { ...MILESTONE, targetCurrency: 'SGD' };
    const ctx = buildAnalysisContext(
      [CASH_HOLDING],
      'USD',
      PERMISSIVE,
      undefined,
      STRATEGY,
      [sgdMilestone],
      [RESERVATION],
      undefined,
    );
    const m = ctx.strategy!.milestones[0];
    expect(m.fxMissing).toBe(true);
    expect(m.totalReservedInTargetCurrency).toBeUndefined();
  });
});
