import type {
  Holding,
  HoldingWithComputedValues,
  Portfolio,
  PortfolioSummary,
  PortfolioSnapshot,
  Breakdown,
} from './types';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Market value = quantity × currentPrice */
export function computeMarketValue(h: Holding): number {
  return h.quantity * h.currentPrice;
}

// ---------------------------------------------------------------------------
// Holdings with computed values
// ---------------------------------------------------------------------------

/**
 * Attaches `marketValue` and `weight` to every holding.
 * Weight is computed within the base-currency cohort only;
 * foreign-currency holdings get weight = 0.
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
    return { ...h, marketValue, weight };
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

  return {
    totalsByCurrency,
    baseCurrencyTotal,
    holdingCount: holdings.length,
    largestHolding,
    cashAndMoneyMarketValue,
    assetClassBreakdown: groupByAssetClass(baseHoldings),
    topHoldings: topHoldingsByValue(withValues, 5),
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
