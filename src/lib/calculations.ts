import type {
  Holding,
  HoldingWithComputedValues,
  Portfolio,
  PortfolioSummary,
  PortfolioSnapshot,
  Breakdown,
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
 */
export function computeHoldingsWithValues(
  holdings: Holding[],
  baseCurrency: string,
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
    const stale = !isCashLike && !isClosed && isStale(h.asOfDate);
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

export function computePortfolioSummary(
  holdings: Holding[],
  baseCurrency: string,
): PortfolioSummary {
  const withValues = computeHoldingsWithValues(holdings, baseCurrency);
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
