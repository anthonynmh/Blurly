export type AssetClass =
  | 'Stock'
  | 'ETF'
  | 'Cash'
  | 'MoneyMarket'
  | 'Bond'
  | 'Crypto'
  | 'Other';

export interface Portfolio {
  id: string;
  name: string;
  baseCurrency: string;
  createdAt: string;
  updatedAt: string;
}

export interface Holding {
  id: string;
  portfolioId: string;
  symbol: string;
  name?: string;
  assetClass: AssetClass;
  quantity: number;
  averagePrice?: number;
  currentPrice: number;
  currency: string;
  sector?: string;
  region?: string;
  broker?: string;
  asOfDate: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type NewHolding = Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateHolding = Partial<NewHolding>;

export interface HoldingWithComputedValues extends Holding {
  /** quantity × currentPrice */
  marketValue: number;
  /** 0..1, within the base-currency cohort only */
  weight: number;
}

export interface Breakdown {
  key: string;
  value: number;
  weight: number;
}

export interface PortfolioSummary {
  totalsByCurrency: Record<string, number>;
  baseCurrencyTotal: number;
  holdingCount: number;
  largestHolding?: HoldingWithComputedValues;
  cashAndMoneyMarketValue: number;
  assetClassBreakdown: Breakdown[];
  topHoldings: HoldingWithComputedValues[];
}

export interface PortfolioSnapshot {
  portfolioId: string;
  snapshotDate: string;
  baseCurrency: string;
  totalValue: number;
  holdings: HoldingWithComputedValues[];
  breakdowns: {
    assetClass: Breakdown[];
    sector: Breakdown[];
    region: Breakdown[];
  };
}

export interface SnapshotMeta {
  id: string;
  portfolioId: string;
  snapshotDate: string;
  totalValue: number;
  createdAt: string;
}

export interface Settings {
  portfolioName: string;
  baseCurrency: string;
  defaultCurrency: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export interface WatchlistItem {
  id: string;
  symbol: string;
  name?: string;
  assetClass?: string;
  sector?: string;
  region?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type NewWatchlistItem = Omit<WatchlistItem, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateWatchlistItem = Partial<NewWatchlistItem>;

// ---------------------------------------------------------------------------
// AI Settings
// ---------------------------------------------------------------------------

export type AiProviderId = 'openai';

export interface AiSettings {
  provider: AiProviderId | string;
  model: string;
  webSearchEnabled: boolean;
  includeExactValues: boolean;
  includeQuantities: boolean;
  includeNotes: boolean;
  keyRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateAiSettings {
  provider?: string;
  model?: string;
  webSearchEnabled?: boolean;
  includeExactValues?: boolean;
  includeQuantities?: boolean;
  includeNotes?: boolean;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Analyst — runs, context, results
// ---------------------------------------------------------------------------

export type AnalysisType =
  | 'PortfolioReview'
  | 'MacroReview'
  | 'SectorReview'
  | 'HoldingReview'
  | 'RebalancingConsiderations';

export type TimeWindow = '7d' | '30d' | '90d' | '1y';

export type AnalysisStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface AnalysisRun {
  id: string;
  analysisType: AnalysisType | string;
  provider: string;
  model: string;
  status: AnalysisStatus;
  inputContextJson: string;
  outputMarkdown?: string;
  outputJson?: string;
  sourcesJson?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface RunAnalysisInput {
  inputContextJson: string;
  analysisType: AnalysisType;
  timeWindow: TimeWindow;
}

/** Privacy flags decide what shape of holding context goes to the model. */
export interface PrivacyFlags {
  includeExactValues: boolean;
  includeQuantities: boolean;
  includeNotes: boolean;
}

/**
 * Holding shape sent to the AI. Strips fields per PrivacyFlags.
 * Always includes: symbol, assetClass, currency, portfolioWeight, asOfDate.
 */
export interface HoldingAnalysisInput {
  symbol: string;
  name?: string;
  assetClass: AssetClass;
  /** Only present when PrivacyFlags.includeQuantities is true. */
  quantity?: number;
  /** Only present when PrivacyFlags.includeExactValues is true. */
  currentPrice?: number;
  currency: string;
  /** Only present when PrivacyFlags.includeExactValues is true. */
  marketValue?: number;
  /** 0..1, always included. */
  portfolioWeight: number;
  sector?: string;
  region?: string;
  asOfDate: string;
}

export interface AnalysisPortfolioContext {
  generatedAt: string;
  baseCurrency: string;
  /** Only present when PrivacyFlags.includeExactValues is true. */
  totalPortfolioValue?: number;
  holdings: HoldingAnalysisInput[];
  breakdowns: {
    assetClass: Breakdown[];
    sector: Breakdown[];
    region: Breakdown[];
  };
  topHoldings: HoldingAnalysisInput[];
  /** Only present when PrivacyFlags.includeExactValues is true. */
  cashAndMoneyMarketValue?: number;
}

export interface AnalysisSource {
  title?: string;
  url: string;
}
