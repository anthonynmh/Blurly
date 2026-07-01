import type {
  AnalysisMilestoneReservationContext,
  AnalysisPortfolioContext,
  AnalysisStrategyCashSplitContext,
  Holding,
  HoldingAnalysisInput,
  HoldingWithComputedValues,
  InvestmentStrategy,
  PrivacyFlags,
  StrategyCashReservation,
  StrategyMilestone,
} from './types';
import {
  computeCashReservationSplit,
  computeHoldingsWithValues,
  computeMilestoneReservations,
  computePortfolioSummary,
  groupByAssetClass,
  groupByRegion,
  groupBySector,
  topHoldingsByValue,
} from './calculations';

/**
 * Builds the live in-memory context sent to the AI analyst.
 *
 * **This is the "do not use snapshots" anchor** — input is the raw `Holding[]`
 * from `holdingService.list()`. Snapshots are never consulted. The function is
 * pure so it stays unit-testable and Tauri-free.
 *
 * Privacy flags strip exact values / quantities / notes before returning.
 * Symbols, asset classes, portfolio weights, isStale, and daysSinceUpdate are
 * always included — they are metadata, not absolute values.
 */
/**
 * Builds the live in-memory context sent to the AI analyst.
 *
 * @param stalenessThresholdDays - Configurable stale threshold from Settings
 *   (Settings.stalenessThresholdDays). Defaults to STALE_THRESHOLD_DAYS (7).
 */
export function buildAnalysisContext(
  holdings: Holding[],
  baseCurrency: string,
  privacy: PrivacyFlags,
  stalenessThresholdDays?: number,
  strategy?: InvestmentStrategy,
  milestones: StrategyMilestone[] = [],
  reservations: StrategyCashReservation[] = [],
  fxUsdSgdRate?: number,
): AnalysisPortfolioContext {
  const withValues = computeHoldingsWithValues(holdings, baseCurrency, stalenessThresholdDays);
  const baseHoldings = withValues.filter((h) => h.currency === baseCurrency);
  const totalPortfolioValue = baseHoldings.reduce((sum, h) => sum + h.marketValue, 0);
  const cashAndMoneyMarketValue = baseHoldings
    .filter((h) => h.assetClass === 'Cash' || h.assetClass === 'MoneyMarket')
    .reduce((sum, h) => sum + h.marketValue, 0);

  // Summary for P/L aggregates and staleness counts.
  const summary = computePortfolioSummary(holdings, baseCurrency, stalenessThresholdDays);

  // Oldest as-of date across all holdings (empty portfolio falls back to today).
  const oldestAsOfDate =
    holdings.length > 0
      ? holdings.reduce(
          (oldest, h) => (h.asOfDate < oldest ? h.asOfDate : oldest),
          holdings[0].asOfDate,
        )
      : new Date().toISOString().slice(0, 10);

  const mapHolding = (h: HoldingWithComputedValues): HoldingAnalysisInput => ({
    symbol: h.symbol,
    name: h.name,
    assetClass: h.assetClass,
    quantity: privacy.includeQuantities ? h.quantity : undefined,
    currentPrice: privacy.includeExactValues ? h.currentPrice : undefined,
    currency: h.currency,
    marketValue: privacy.includeExactValues ? h.marketValue : undefined,
    portfolioWeight: h.weight,
    sector: h.sector,
    region: h.region,
    asOfDate: h.asOfDate,
    // Cost-basis fields — absolute values gated, ratio always sent.
    averagePrice: privacy.includeExactValues ? h.averagePrice : undefined,
    costBasis: privacy.includeExactValues && h.costBasis != null ? h.costBasis : undefined,
    unrealizedPL: privacy.includeExactValues && h.unrealizedPL != null ? h.unrealizedPL : undefined,
    unrealizedPLPercent: h.unrealizedPLPercent ?? undefined,
    // Staleness metadata — always sent (not absolute values).
    isStale: h.isStale,
    daysSinceUpdate: h.daysSinceUpdate,
  });

  const context: AnalysisPortfolioContext = {
    generatedAt: new Date().toISOString(),
    baseCurrency,
    totalPortfolioValue: privacy.includeExactValues ? totalPortfolioValue : undefined,
    holdings: withValues.map(mapHolding),
    topHoldings: topHoldingsByValue(withValues, 5).map(mapHolding),
    breakdowns: {
      assetClass: groupByAssetClass(baseHoldings),
      sector: groupBySector(baseHoldings),
      region: groupByRegion(baseHoldings),
    },
    cashAndMoneyMarketValue: privacy.includeExactValues ? cashAndMoneyMarketValue : undefined,
    // P/L aggregates — absolute values gated, ratio always sent.
    totalCostBasis: privacy.includeExactValues ? summary.totalCostBasis : undefined,
    totalUnrealizedPL: privacy.includeExactValues ? summary.totalUnrealizedPL : undefined,
    totalUnrealizedPLPercent: summary.totalUnrealizedPLPercent ?? undefined,
    // Freshness metadata — always sent.
    staleHoldingsCount: summary.staleHoldingsCount,
    oldestAsOfDate,
  };

  if (strategy) {
    const milestoneReservations = computeMilestoneReservations(
      milestones,
      reservations,
      fxUsdSgdRate,
    );
    const holdingById = new Map(holdings.map((h) => [h.id, h]));

    context.strategy = {
      investorPersonality: strategy.investorPersonality,
      notes: strategy.notes,
      milestones: milestones.map((m) => {
        const summary = milestoneReservations.get(m.id);
        const linked = summary?.reservations ?? [];
        const reservationsContext: AnalysisMilestoneReservationContext[] | undefined =
          linked.length > 0
            ? linked.map((r) => {
                const h = holdingById.get(r.holdingId);
                return {
                  amount: privacy.includeExactValues ? r.amount : undefined,
                  currency: r.currency,
                  holdingSymbol: h?.symbol ?? 'unknown',
                  holdingName: h?.name,
                  notes: privacy.includeNotes ? r.notes : undefined,
                };
              })
            : undefined;
        return {
          label: m.label,
          description: m.description,
          targetDate: m.targetDate,
          targetAmount: m.targetAmount,
          targetCurrency: m.targetCurrency,
          countdown: describeMilestoneCountdown(m.targetDate),
          isOverdue: isPastDate(m.targetDate),
          reservations: reservationsContext,
          totalReservedInTargetCurrency:
            privacy.includeExactValues && summary && !summary.fxMissing && m.targetCurrency
              ? summary.totalReservedInTargetCurrency
              : undefined,
          fxMissing: summary?.fxMissing ? true : undefined,
        };
      }),
    };

    // Strategy-wide cash split
    if (reservations.length > 0) {
      const split = computeCashReservationSplit(
        holdings,
        reservations,
        baseCurrency,
        fxUsdSgdRate,
      );
      const cashSplit: AnalysisStrategyCashSplitContext = {
        fxMissing: split.fxMissing ? true : undefined,
      };
      if (privacy.includeExactValues) {
        cashSplit.totalCashAndMoneyMarket = split.totalCashAndMoneyMarket;
        if (!split.fxMissing) {
          cashSplit.totalReserved = split.totalReserved;
          cashSplit.estimatedCashDrag = split.estimatedCashDrag;
        }
      }
      context.strategy.cashSplit = cashSplit;
    }
  }

  return context;
}

/** Default privacy stance: tickers + weights + sectors, no exact values. */
export const DEFAULT_PRIVACY: PrivacyFlags = {
  includeExactValues: false,
  includeQuantities: false,
  includeNotes: false,
};

export function describeMilestoneCountdown(targetDate: string, now = new Date()): string {
  const target = parseDateOnly(targetDate);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return 'today';
  const absDays = Math.abs(diffDays);
  if (absDays < 31) {
    return diffDays < 0 ? `overdue by ${absDays}d` : `${absDays}d left`;
  }
  const months = Math.round(absDays / 30.4375);
  if (months < 24) {
    return diffDays < 0 ? `overdue by ${months}m` : `${months}m left`;
  }
  const years = Math.round(months / 12);
  return diffDays < 0 ? `overdue by ${years}y` : `${years}y left`;
}

function isPastDate(targetDate: string, now = new Date()): boolean {
  const target = parseDateOnly(targetDate);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return target.getTime() < today.getTime();
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}
