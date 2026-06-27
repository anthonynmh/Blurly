import type {
  AnalysisPortfolioContext,
  Holding,
  HoldingAnalysisInput,
  HoldingWithComputedValues,
  PrivacyFlags,
} from './types';
import {
  computeHoldingsWithValues,
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
 * Symbols, asset classes, and portfolio weights are always included.
 */
export function buildAnalysisContext(
  holdings: Holding[],
  baseCurrency: string,
  privacy: PrivacyFlags,
): AnalysisPortfolioContext {
  const withValues = computeHoldingsWithValues(holdings, baseCurrency);
  const baseHoldings = withValues.filter((h) => h.currency === baseCurrency);
  const totalPortfolioValue = baseHoldings.reduce((sum, h) => sum + h.marketValue, 0);
  const cashAndMoneyMarketValue = baseHoldings
    .filter((h) => h.assetClass === 'Cash' || h.assetClass === 'MoneyMarket')
    .reduce((sum, h) => sum + h.marketValue, 0);

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
  });

  return {
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
  };
}

/** Default privacy stance: tickers + weights + sectors, no exact values. */
export const DEFAULT_PRIVACY: PrivacyFlags = {
  includeExactValues: false,
  includeQuantities: false,
  includeNotes: false,
};
