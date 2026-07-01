import type {
  Breakdown,
  Holding,
  HoldingWithComputedValues,
  Portfolio,
  PortfolioSnapshot,
  PortfolioSummary,
  StrategyCashReservation,
  StrategyMilestone,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Holdings whose as-of date is older than this many calendar days are stale. */
export const STALE_THRESHOLD_DAYS = 7;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Market value = quantity × currentPrice */
export function computeMarketValue(h: Holding): number {
  return h.quantity * h.currentPrice;
}

/** Cost basis = quantity × averagePrice, or null when averagePrice is absent. */
export function computeCostBasis(h: Holding): number | null {
  return h.averagePrice == null ? null : h.quantity * h.averagePrice;
}

/**
 * Unrealized P/L = marketValue − costBasis.
 * Returns null when costBasis is null (averagePrice absent).
 */
export function computeUnrealizedPL(h: Holding): number | null {
  const cost = computeCostBasis(h);
  if (cost == null) return null;
  return computeMarketValue(h) - cost;
}

/**
 * Unrealized P/L % = (marketValue − costBasis) / costBasis.
 * Returns null when costBasis is null OR costBasis === 0 (e.g. RSU grants where cost
 * basis is legitimately zero — the absolute P/L is still valid, just not a ratio).
 */
export function computeUnrealizedPLPercent(h: Holding): number | null {
  const cost = computeCostBasis(h);
  if (cost == null || cost === 0) return null;
  return (computeMarketValue(h) - cost) / cost;
}

/**
 * Calendar days between asOfDate (YYYY-MM-DD) and today (or the provided date),
 * computed in UTC to avoid timezone-offset drift at midnight.
 */
export function daysSince(asOfDate: string, today?: Date): number {
  const asOf = new Date(asOfDate + 'T00:00:00Z').getTime();
  const ref = today ?? new Date();
  const todayMidnight = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
  return Math.floor((todayMidnight - asOf) / 86_400_000);
}

/**
 * True when the holding's as-of date is more than `threshold` calendar days old.
 * Optional `today` parameter for deterministic testing.
 */
export function isStale(
  asOfDate: string,
  threshold: number = STALE_THRESHOLD_DAYS,
  today?: Date,
): boolean {
  return daysSince(asOfDate, today) > threshold;
}

// ---------------------------------------------------------------------------
// Holdings with computed values
// ---------------------------------------------------------------------------

/**
 * Attaches `marketValue`, `weight`, cost-basis, unrealized P/L, and staleness
 * metadata to every holding.
 *
 * Weight is computed within the base-currency cohort only; foreign-currency
 * holdings get weight = 0.
 *
 * Cash / MoneyMarket and zero-quantity holdings are excluded from staleness
 * (isStale = false) since their price does not need refreshing.
 *
 * @param stalenessThresholdDays - Override the default 7-day stale threshold
 *   (sourced from the user's Settings.stalenessThresholdDays). Defaults to
 *   STALE_THRESHOLD_DAYS when not provided.
 */
export function computeHoldingsWithValues(
  holdings: Holding[],
  baseCurrency: string,
  stalenessThresholdDays: number = STALE_THRESHOLD_DAYS,
): HoldingWithComputedValues[] {
  const baseTotal = holdings
    .filter((h) => h.currency === baseCurrency)
    .reduce((sum, h) => sum + computeMarketValue(h), 0);

  return holdings.map((h) => {
    const marketValue = computeMarketValue(h);
    const weight =
      h.currency === baseCurrency && baseTotal > 0 ? marketValue / baseTotal : 0;
    const costBasis = computeCostBasis(h);
    const unrealizedPL = computeUnrealizedPL(h);
    const unrealizedPLPercent = computeUnrealizedPLPercent(h);
    const days = daysSince(h.asOfDate);
    const isCashLike = h.assetClass === 'Cash' || h.assetClass === 'MoneyMarket';
    const isClosed = h.quantity === 0;
    const stale = !isCashLike && !isClosed && isStale(h.asOfDate, stalenessThresholdDays);
    return {
      ...h,
      marketValue,
      weight,
      costBasis,
      unrealizedPL,
      unrealizedPLPercent,
      daysSinceUpdate: days,
      isStale: stale,
    };
  });
}

// ---------------------------------------------------------------------------
// Breakdown helpers
// ---------------------------------------------------------------------------

function groupBy(
  holdings: HoldingWithComputedValues[],
  keyFn: (h: HoldingWithComputedValues) => string,
): Breakdown[] {
  const groups: Record<string, number> = {};
  for (const h of holdings) {
    const k = keyFn(h);
    groups[k] = (groups[k] ?? 0) + h.marketValue;
  }
  const total = Object.values(groups).reduce((s, v) => s + v, 0);
  return Object.entries(groups)
    .map(([key, value]) => ({
      key,
      value,
      weight: total > 0 ? value / total : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

export function groupByAssetClass(hs: HoldingWithComputedValues[]): Breakdown[] {
  return groupBy(hs, (h) => h.assetClass);
}

export function groupBySector(hs: HoldingWithComputedValues[]): Breakdown[] {
  return groupBy(hs, (h) => h.sector ?? 'Unknown');
}

export function groupByRegion(hs: HoldingWithComputedValues[]): Breakdown[] {
  return groupBy(hs, (h) => h.region ?? 'Unknown');
}

export function topHoldingsByValue(
  hs: HoldingWithComputedValues[],
  n: number = 5,
): HoldingWithComputedValues[] {
  return [...hs].sort((a, b) => b.marketValue - a.marketValue).slice(0, n);
}

// ---------------------------------------------------------------------------
// Portfolio summary (for Dashboard)
// ---------------------------------------------------------------------------

/**
 * @param stalenessThresholdDays - Override the default 7-day stale threshold.
 *   Sourced from Settings.stalenessThresholdDays. Defaults to STALE_THRESHOLD_DAYS.
 */
export function computePortfolioSummary(
  holdings: Holding[],
  baseCurrency: string,
  stalenessThresholdDays: number = STALE_THRESHOLD_DAYS,
): PortfolioSummary {
  const withValues = computeHoldingsWithValues(holdings, baseCurrency, stalenessThresholdDays);
  const baseHoldings = withValues.filter((h) => h.currency === baseCurrency);

  // Per-currency totals
  const totalsByCurrency: Record<string, number> = {};
  for (const h of withValues) {
    totalsByCurrency[h.currency] =
      (totalsByCurrency[h.currency] ?? 0) + h.marketValue;
  }

  const baseCurrencyTotal = totalsByCurrency[baseCurrency] ?? 0;

  const sorted = [...withValues].sort((a, b) => b.marketValue - a.marketValue);
  const largestHolding = sorted[0];

  const cashAndMoneyMarketValue = baseHoldings
    .filter((h) => h.assetClass === 'Cash' || h.assetClass === 'MoneyMarket')
    .reduce((sum, h) => sum + h.marketValue, 0);

  // P/L aggregates — base-currency non-Cash/MM holdings only
  const investmentHoldings = baseHoldings.filter(
    (h) => h.assetClass !== 'Cash' && h.assetClass !== 'MoneyMarket',
  );

  let totalCostBasis = 0;
  let totalUnrealizedPL = 0;
  let missingCostBasisCount = 0;
  let staleHoldingsCount = 0;

  for (const h of investmentHoldings) {
    if (h.costBasis != null) {
      totalCostBasis += h.costBasis;
      totalUnrealizedPL += h.unrealizedPL ?? 0;
    } else {
      missingCostBasisCount += 1;
    }
    if (h.isStale) {
      staleHoldingsCount += 1;
    }
  }

  const totalUnrealizedPLPercent =
    totalCostBasis > 0 ? totalUnrealizedPL / totalCostBasis : null;

  return {
    totalsByCurrency,
    baseCurrencyTotal,
    holdingCount: holdings.length,
    largestHolding,
    cashAndMoneyMarketValue,
    assetClassBreakdown: groupByAssetClass(baseHoldings),
    topHoldings: topHoldingsByValue(withValues, 5),
    totalCostBasis,
    totalUnrealizedPL,
    totalUnrealizedPLPercent,
    staleHoldingsCount,
    missingCostBasisCount,
  };
}

// ---------------------------------------------------------------------------
// Display-layer FX converter
// ---------------------------------------------------------------------------

/**
 * Converts a PortfolioSummary from its original base currency into a chosen
 * display currency by re-aggregating each holding's values at the given FX rate.
 *
 * - Holdings in currencies other than USD or SGD are excluded from the converted
 *   aggregates (no such holdings should exist post Phase 1, but defended against).
 * - Rate semantics: `{ 'USD->SGD': 1.35 }` means 1 USD = 1.35 SGD.
 *   SGD→USD conversion uses `1 / rate`.
 * - If the required FX rate is missing (undefined or 0), the original summary is
 *   returned unchanged.
 * - Holdings with quantity 0 contribute 0 to all aggregates.
 * - Holdings with null costBasis are excluded from totalCostBasis.
 *
 * This is a pure function with no Tauri dependency — fully unit-testable.
 */
export function convertSummaryToDisplayCurrency(
  summary: PortfolioSummary,
  holdings: Holding[],
  displayCcy: 'USD' | 'SGD',
  fxRates: { 'USD->SGD'?: number },
): PortfolioSummary {
  const usdSgdRate = fxRates['USD->SGD'];

  // If the rate is missing or zero, return the original summary unchanged.
  if (!usdSgdRate) return summary;

  /** Returns the multiplier to convert a value in `ccy` into `displayCcy`. */
  function convRate(ccy: string): number | null {
    if (ccy === displayCcy) return 1;
    if (ccy === 'USD' && displayCcy === 'SGD') return usdSgdRate!;
    if (ccy === 'SGD' && displayCcy === 'USD') return 1 / usdSgdRate!;
    return null; // non-USD/SGD: excluded from aggregate
  }

  // Compute converted values per holding.
  type ConvItem = {
    h: Holding;
    convertedMV: number;
    convertedCostBasis: number | null;
    convertedPL: number | null;
  };

  let totalConvertedMV = 0;
  const items: ConvItem[] = [];

  for (const h of holdings) {
    const r = convRate(h.currency);
    if (r === null) continue; // skip non-USD/SGD

    const mv = h.quantity * h.currentPrice; // pre-conversion market value
    const convertedMV = mv * r;
    totalConvertedMV += convertedMV;

    const costBasis = h.averagePrice != null ? h.quantity * h.averagePrice : null;
    const convertedCostBasis = costBasis != null ? costBasis * r : null;
    const pl = costBasis != null ? mv - costBasis : null;
    const convertedPL = pl != null ? pl * r : null;

    items.push({ h, convertedMV, convertedCostBasis, convertedPL });
  }

  // Aggregate P/L and cash totals in displayCcy.
  let totalCostBasis = 0;
  let totalUnrealizedPL = 0;
  let cashAndMoneyMarketValue = 0;

  for (const item of items) {
    const isCashLike =
      item.h.assetClass === 'Cash' || item.h.assetClass === 'MoneyMarket';
    if (isCashLike) {
      cashAndMoneyMarketValue += item.convertedMV;
    } else if (item.convertedCostBasis != null) {
      totalCostBasis += item.convertedCostBasis;
      totalUnrealizedPL += item.convertedPL ?? 0;
    }
  }

  const totalUnrealizedPLPercent =
    totalCostBasis > 0 ? totalUnrealizedPL / totalCostBasis : null;

  // Build converted HoldingWithComputedValues for largestHolding / topHoldings.
  // currency is set to displayCcy so downstream formatters use the correct symbol.
  // daysSinceUpdate / isStale are recomputed from raw data using default threshold;
  // they're display-only here and do not feed the summary's staleHoldingsCount.
  const convertedHWV: HoldingWithComputedValues[] = items.map((item) => {
    const convertedCostBasis = item.convertedCostBasis;
    const convertedPL = item.convertedPL;
    const convertedPLPercent =
      convertedCostBasis != null && convertedCostBasis !== 0
        ? (convertedPL ?? 0) / convertedCostBasis
        : null;
    return {
      ...item.h,
      currency: displayCcy,
      marketValue: item.convertedMV,
      weight: totalConvertedMV > 0 ? item.convertedMV / totalConvertedMV : 0,
      costBasis: convertedCostBasis,
      unrealizedPL: convertedPL,
      unrealizedPLPercent: convertedPLPercent,
      daysSinceUpdate: daysSince(item.h.asOfDate),
      isStale: isStale(item.h.asOfDate),
    };
  });

  const sortedByMV = [...convertedHWV].sort((a, b) => b.marketValue - a.marketValue);
  const largestHolding = sortedByMV[0];
  const topHoldings = sortedByMV.slice(0, 5);

  // Recompute asset-class breakdown from converted values.
  const groups: Record<string, number> = {};
  for (const hwv of convertedHWV) {
    groups[hwv.assetClass] = (groups[hwv.assetClass] ?? 0) + hwv.marketValue;
  }
  const assetClassBreakdown: Breakdown[] = Object.entries(groups)
    .map(([key, value]) => ({
      key,
      value,
      weight: totalConvertedMV > 0 ? value / totalConvertedMV : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    ...summary,
    baseCurrencyTotal: totalConvertedMV,
    totalCostBasis,
    totalUnrealizedPL,
    totalUnrealizedPLPercent,
    cashAndMoneyMarketValue,
    largestHolding,
    topHoldings,
    assetClassBreakdown,
  };
}

// ---------------------------------------------------------------------------
// Snapshot builder (runs in TypeScript, persisted by Rust)
// ---------------------------------------------------------------------------

/**
 * Build a full PortfolioSnapshot from current holdings.
 * This is the seam for the future AI-analyst module.
 */
export function buildPortfolioSnapshot(
  portfolio: Portfolio,
  holdings: Holding[],
  date?: string,
): PortfolioSnapshot {
  const snapshotDate = date ?? new Date().toISOString().slice(0, 10);
  const withValues = computeHoldingsWithValues(holdings, portfolio.baseCurrency);
  const baseHoldings = withValues.filter(
    (h) => h.currency === portfolio.baseCurrency,
  );
  const totalValue = baseHoldings.reduce((sum, h) => sum + h.marketValue, 0);

  return {
    portfolioId: portfolio.id,
    snapshotDate,
    baseCurrency: portfolio.baseCurrency,
    totalValue,
    holdings: withValues,
    breakdowns: {
      assetClass: groupByAssetClass(baseHoldings),
      sector: groupBySector(baseHoldings),
      region: groupByRegion(baseHoldings),
    },
  };
}

// ---------------------------------------------------------------------------
// Milestone-linked cash reservations ("untouchables")
// ---------------------------------------------------------------------------

/**
 * Convert `amount` from `fromCurrency` into `toCurrency`.
 * Returns `null` when currencies differ but no FX rate is provided.
 * `fxUsdSgdRate` is stored as "1 USD = N SGD" (matches Settings.fxUsdSgdRate).
 */
export function convertSgdUsd(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  fxUsdSgdRate: number | undefined,
): number | null {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) return amount;
  if (fxUsdSgdRate == null || !isFinite(fxUsdSgdRate) || fxUsdSgdRate <= 0) return null;
  if (from === 'USD' && to === 'SGD') return amount * fxUsdSgdRate;
  if (from === 'SGD' && to === 'USD') return amount / fxUsdSgdRate;
  // Anything else falls outside the app's SGD/USD scope — return null.
  return null;
}

export interface HoldingCashSplit {
  totalValue: number;
  totalReserved: number;
  available: number;
  overReserved: boolean;
  fxMissing: boolean;
}

export interface CashReservationSplit {
  perHolding: Map<string, HoldingCashSplit>;
  totalReserved: number;
  totalCashAndMoneyMarket: number;
  estimatedCashDrag: number;
  fxMissing: boolean;
}

/**
 * Compute the reserved vs available split for cash-equivalent holdings.
 *
 * - Only holdings in `baseCurrency` count toward `totalCashAndMoneyMarket`, matching
 *   the existing `cashAndMoneyMarketValue` filter in analysis.ts.
 * - Reservations are converted into each holding's currency for the per-holding
 *   split, and into `baseCurrency` for the totals. When a conversion is needed
 *   and no FX rate is available, that reservation contributes 0 and `fxMissing`
 *   is set on the affected holding / on the top-level totals.
 */
export function computeCashReservationSplit(
  holdings: Holding[],
  reservations: StrategyCashReservation[],
  baseCurrency: string,
  fxUsdSgdRate?: number,
): CashReservationSplit {
  const cashHoldings = holdings.filter(
    (h) => h.assetClass === 'Cash' || h.assetClass === 'MoneyMarket',
  );
  const perHolding = new Map<string, HoldingCashSplit>();
  let totalReservedInBase = 0;
  let totalCashInBase = 0;
  let topLevelFxMissing = false;

  for (const holding of cashHoldings) {
    const totalValue = computeMarketValue(holding);
    const linked = reservations.filter((r) => r.holdingId === holding.id);
    let holdingReserved = 0;
    let holdingFxMissing = false;
    for (const r of linked) {
      const converted = convertSgdUsd(r.amount, r.currency, holding.currency, fxUsdSgdRate);
      if (converted == null) {
        holdingFxMissing = true;
      } else {
        holdingReserved += converted;
      }
    }
    const available = totalValue - holdingReserved;
    perHolding.set(holding.id, {
      totalValue,
      totalReserved: holdingReserved,
      available,
      overReserved: holdingReserved > totalValue + 1e-6,
      fxMissing: holdingFxMissing,
    });

    if (holding.currency === baseCurrency) {
      totalCashInBase += totalValue;
    }
  }

  for (const r of reservations) {
    const converted = convertSgdUsd(r.amount, r.currency, baseCurrency, fxUsdSgdRate);
    if (converted == null) {
      topLevelFxMissing = true;
    } else {
      totalReservedInBase += converted;
    }
  }

  return {
    perHolding,
    totalReserved: totalReservedInBase,
    totalCashAndMoneyMarket: totalCashInBase,
    estimatedCashDrag: totalCashInBase - totalReservedInBase,
    fxMissing: topLevelFxMissing,
  };
}

export interface MilestoneReservationSummary {
  reservations: StrategyCashReservation[];
  /** Sum in the milestone's own targetCurrency (falls back to baseCurrency when unset). */
  totalReservedInTargetCurrency: number;
  /** True when any reservation could not be converted into the milestone currency. */
  fxMissing: boolean;
  /** Raw per-currency sums, kept so the UI can show `SGD 20k + USD 5k reserved` when FX is missing. */
  byCurrency: Record<string, number>;
}

/**
 * Group reservations by milestone id and compute the total reserved amount in
 * each milestone's currency. If the milestone has no `targetCurrency`, the raw
 * per-currency sums are still returned.
 */
export function computeMilestoneReservations(
  milestones: StrategyMilestone[],
  reservations: StrategyCashReservation[],
  fxUsdSgdRate?: number,
): Map<string, MilestoneReservationSummary> {
  const out = new Map<string, MilestoneReservationSummary>();
  for (const m of milestones) {
    const linked = reservations.filter((r) => r.milestoneId === m.id);
    const byCurrency: Record<string, number> = {};
    for (const r of linked) {
      byCurrency[r.currency] = (byCurrency[r.currency] ?? 0) + r.amount;
    }
    let totalInTarget = 0;
    let fxMissing = false;
    const target = m.targetCurrency ?? null;
    if (target) {
      for (const r of linked) {
        const converted = convertSgdUsd(r.amount, r.currency, target, fxUsdSgdRate);
        if (converted == null) {
          fxMissing = true;
        } else {
          totalInTarget += converted;
        }
      }
    }
    out.set(m.id, {
      reservations: linked,
      totalReservedInTargetCurrency: totalInTarget,
      fxMissing,
      byCurrency,
    });
  }
  return out;
}
