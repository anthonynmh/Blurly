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
  /** ISO-8601 timestamp set whenever current_price or as_of_date changes. */
  priceUpdatedAt?: string;
}

export type NewHolding = Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateHolding = Partial<NewHolding>;

export interface HoldingWithComputedValues extends Holding {
  /** quantity × currentPrice */
  marketValue: number;
  /** 0..1, within the base-currency cohort only */
  weight: number;
  /** quantity × averagePrice, or null when averagePrice is absent */
  costBasis: number | null;
  /** marketValue − costBasis, or null when costBasis is null */
  unrealizedPL: number | null;
  /** (marketValue − costBasis) / costBasis, or null when costBasis is null or 0 */
  unrealizedPLPercent: number | null;
  /** Calendar days since asOfDate, computed in UTC */
  daysSinceUpdate: number;
  /** true when daysSinceUpdate > STALE_THRESHOLD_DAYS and not Cash/MoneyMarket/zero-qty */
  isStale: boolean;
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
  /** Sum of costBasis for base-currency investment holdings that have averagePrice set. */
  totalCostBasis: number;
  /** Sum of unrealizedPL for base-currency investment holdings that have averagePrice set. */
  totalUnrealizedPL: number;
  /** totalUnrealizedPL / totalCostBasis when totalCostBasis > 0, else null. */
  totalUnrealizedPLPercent: number | null;
  /** Count of base-currency non-Cash/MM holdings where isStale is true. */
  staleHoldingsCount: number;
  /** Count of base-currency non-Cash/MM holdings where averagePrice is absent. */
  missingCostBasisCount: number;
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
  /** CDHash of the signing identity active when the key was last saved. */
  keySigningCdhash?: string;
  /** Authority string of the signing identity active when the key was last saved. */
  keySigningAuthority?: string;
}

export interface UpdateAiSettings {
  provider?: string;
  model?: string;
  webSearchEnabled?: boolean;
  includeExactValues?: boolean;
  includeQuantities?: boolean;
  includeNotes?: boolean;
}

export interface SigningIdentitySummary {
  authority?: string;
  cdhash?: string;
  isAdhoc: boolean;
}

export interface SigningIdentity {
  teamId?: string;
  authority?: string;
  identifier?: string;
  cdhash?: string;
  isAdhoc: boolean;
  executablePath: string;
}

export type ApiKeyPresenceStatus = 'saved' | 'missing' | 'stale' | 'error';

export interface ApiKeyStatus {
  provider: string;
  keyRef?: string;
  status: ApiKeyPresenceStatus;
  message?: string;
  /** Signing identity that was active when the key was last saved. */
  signedByWhenSaved?: SigningIdentitySummary;
  /** Signing identity of the currently running process. */
  signedByNow?: SigningIdentitySummary;
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
 * Always includes: symbol, assetClass, currency, portfolioWeight, asOfDate, isStale, daysSinceUpdate.
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
  /** Only present when PrivacyFlags.includeExactValues is true. */
  averagePrice?: number;
  /** Only present when PrivacyFlags.includeExactValues is true. */
  costBasis?: number;
  /** Only present when PrivacyFlags.includeExactValues is true. */
  unrealizedPL?: number;
  /** Always included (ratio, not absolute). */
  unrealizedPLPercent?: number;
  /** Always included. */
  isStale: boolean;
  /** Always included. */
  daysSinceUpdate: number;
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
  /** Only present when PrivacyFlags.includeExactValues is true. */
  totalCostBasis?: number;
  /** Only present when PrivacyFlags.includeExactValues is true. */
  totalUnrealizedPL?: number;
  /** Always included (ratio). */
  totalUnrealizedPLPercent?: number;
  /** Always included. */
  staleHoldingsCount: number;
  /** Always included — earliest asOfDate across all holdings. */
  oldestAsOfDate: string;
}

// ---------------------------------------------------------------------------
// Bulk price update
// ---------------------------------------------------------------------------

export interface BulkPriceUpdate {
  id: string;
  currentPrice: number;
  asOfDate: string;
}

export interface AnalysisSource {
  title?: string;
  url: string;
}
