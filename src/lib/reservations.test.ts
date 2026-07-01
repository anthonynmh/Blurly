import { describe, expect, it } from 'vitest';

import {
  computeCashReservationSplit,
  computeMilestoneReservations,
  convertSgdUsd,
} from './calculations';
import type { Holding, StrategyCashReservation, StrategyMilestone } from './types';

const NOW = new Date().toISOString();

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 'h1',
    portfolioId: 'default',
    symbol: 'CSOP',
    assetClass: 'MoneyMarket',
    quantity: 1,
    currentPrice: 100000,
    currency: 'SGD',
    asOfDate: '2024-01-01',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeMilestone(overrides: Partial<StrategyMilestone> = {}): StrategyMilestone {
  return {
    id: 'm1',
    label: 'House deposit',
    targetDate: '2030-01-01',
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeReservation(
  overrides: Partial<StrategyCashReservation> = {},
): StrategyCashReservation {
  return {
    id: 'r1',
    holdingId: 'h1',
    milestoneId: 'm1',
    amount: 20000,
    currency: 'SGD',
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('convertSgdUsd', () => {
  it('returns amount unchanged when currencies match', () => {
    expect(convertSgdUsd(1000, 'SGD', 'SGD', 1.35)).toBe(1000);
    expect(convertSgdUsd(1000, 'USD', 'USD', undefined)).toBe(1000);
  });
  it('converts USD → SGD by multiplying', () => {
    expect(convertSgdUsd(100, 'USD', 'SGD', 1.35)).toBeCloseTo(135);
  });
  it('converts SGD → USD by dividing', () => {
    expect(convertSgdUsd(135, 'SGD', 'USD', 1.35)).toBeCloseTo(100);
  });
  it('returns null when cross-currency and no rate provided', () => {
    expect(convertSgdUsd(100, 'USD', 'SGD', undefined)).toBeNull();
  });
  it('returns null for unsupported currency pairs', () => {
    expect(convertSgdUsd(100, 'EUR', 'SGD', 1.35)).toBeNull();
  });
});

describe('computeCashReservationSplit', () => {
  it('returns zero totals when no cash-equivalent holdings exist', () => {
    const stock = makeHolding({ assetClass: 'Stock' });
    const split = computeCashReservationSplit([stock], [], 'SGD');
    expect(split.totalCashAndMoneyMarket).toBe(0);
    expect(split.totalReserved).toBe(0);
    expect(split.estimatedCashDrag).toBe(0);
    expect(split.perHolding.size).toBe(0);
    expect(split.fxMissing).toBe(false);
  });

  it('computes per-holding split for a single reservation in same currency', () => {
    const holding = makeHolding({ id: 'csop', currentPrice: 100_000, currency: 'SGD' });
    const reservation = makeReservation({ holdingId: 'csop', amount: 20000, currency: 'SGD' });
    const split = computeCashReservationSplit([holding], [reservation], 'SGD');
    const perHolding = split.perHolding.get('csop')!;
    expect(perHolding.totalValue).toBe(100_000);
    expect(perHolding.totalReserved).toBe(20_000);
    expect(perHolding.available).toBe(80_000);
    expect(perHolding.overReserved).toBe(false);
    expect(perHolding.fxMissing).toBe(false);
    expect(split.totalCashAndMoneyMarket).toBe(100_000);
    expect(split.totalReserved).toBe(20_000);
    expect(split.estimatedCashDrag).toBe(80_000);
  });

  it('flags over-reserved holdings but still computes numbers', () => {
    const holding = makeHolding({ id: 'csop', currentPrice: 10_000, currency: 'SGD' });
    const reservation = makeReservation({ holdingId: 'csop', amount: 15_000, currency: 'SGD' });
    const split = computeCashReservationSplit([holding], [reservation], 'SGD');
    const perHolding = split.perHolding.get('csop')!;
    expect(perHolding.overReserved).toBe(true);
    expect(perHolding.available).toBe(-5000);
    expect(split.estimatedCashDrag).toBe(-5000);
  });

  it('converts cross-currency reservations via the FX rate', () => {
    const holding = makeHolding({ id: 'csop', currentPrice: 100_000, currency: 'SGD' });
    // 100 USD reservation, rate 1.35 → 135 SGD
    const reservation = makeReservation({ holdingId: 'csop', amount: 100, currency: 'USD' });
    const split = computeCashReservationSplit([holding], [reservation], 'SGD', 1.35);
    const perHolding = split.perHolding.get('csop')!;
    expect(perHolding.totalReserved).toBeCloseTo(135);
    expect(perHolding.fxMissing).toBe(false);
    expect(split.totalReserved).toBeCloseTo(135);
    expect(split.fxMissing).toBe(false);
  });

  it('sets fxMissing when cross-currency reservation lacks an FX rate', () => {
    const holding = makeHolding({ id: 'csop', currentPrice: 100_000, currency: 'SGD' });
    const reservation = makeReservation({ holdingId: 'csop', amount: 100, currency: 'USD' });
    const split = computeCashReservationSplit([holding], [reservation], 'SGD');
    expect(split.perHolding.get('csop')!.fxMissing).toBe(true);
    expect(split.fxMissing).toBe(true);
    // Missing FX contributes 0 to totals, not NaN.
    expect(split.perHolding.get('csop')!.totalReserved).toBe(0);
  });

  it('only counts base-currency cash holdings toward totalCashAndMoneyMarket', () => {
    const sgdCash = makeHolding({ id: 'a', currentPrice: 100_000, currency: 'SGD' });
    const usdCash = makeHolding({
      id: 'b',
      currentPrice: 50_000,
      currency: 'USD',
      assetClass: 'Cash',
      symbol: 'USDCASH',
    });
    const split = computeCashReservationSplit([sgdCash, usdCash], [], 'SGD');
    expect(split.totalCashAndMoneyMarket).toBe(100_000);
  });
});

describe('computeMilestoneReservations', () => {
  it('returns empty summary for milestones with no reservations', () => {
    const m = makeMilestone({ targetAmount: 50_000, targetCurrency: 'SGD' });
    const summaries = computeMilestoneReservations([m], []);
    const summary = summaries.get(m.id)!;
    expect(summary.reservations).toEqual([]);
    expect(summary.totalReservedInTargetCurrency).toBe(0);
    expect(summary.byCurrency).toEqual({});
    expect(summary.fxMissing).toBe(false);
  });

  it('sums same-currency reservations directly', () => {
    const m = makeMilestone({ targetAmount: 50_000, targetCurrency: 'SGD' });
    const r1 = makeReservation({ id: 'r1', milestoneId: m.id, amount: 20_000, currency: 'SGD' });
    const r2 = makeReservation({ id: 'r2', milestoneId: m.id, amount: 10_000, currency: 'SGD' });
    const summary = computeMilestoneReservations([m], [r1, r2]).get(m.id)!;
    expect(summary.totalReservedInTargetCurrency).toBe(30_000);
    expect(summary.byCurrency).toEqual({ SGD: 30_000 });
  });

  it('converts cross-currency reservations via FX', () => {
    const m = makeMilestone({ targetAmount: 50_000, targetCurrency: 'SGD' });
    const r = makeReservation({ milestoneId: m.id, amount: 100, currency: 'USD' });
    const summary = computeMilestoneReservations([m], [r], 1.35).get(m.id)!;
    expect(summary.totalReservedInTargetCurrency).toBeCloseTo(135);
    expect(summary.fxMissing).toBe(false);
    expect(summary.byCurrency).toEqual({ USD: 100 });
  });

  it('flags fxMissing when FX rate is absent for cross-currency', () => {
    const m = makeMilestone({ targetAmount: 50_000, targetCurrency: 'SGD' });
    const r = makeReservation({ milestoneId: m.id, amount: 100, currency: 'USD' });
    const summary = computeMilestoneReservations([m], [r]).get(m.id)!;
    expect(summary.fxMissing).toBe(true);
    expect(summary.totalReservedInTargetCurrency).toBe(0);
  });
});
