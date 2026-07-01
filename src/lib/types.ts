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
  /** Provenance for the valuation price, e.g. manual or twelvedata. */
  priceSource?: string;
  /** Timestamp when a market-data provider last attempted to refresh this price. */
  priceRefreshedAt?: string;
  /** Last provider refresh error, if any. */
  priceRefreshError?: string;
  /** Optional provider-specific symbol override. */
  providerSymbol?: string;
}

export type NewHolding = Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateHolding = Partial<NewHolding>;

export interface TwelveDataUsage {
  currentUsage?: number;
  planLimit?: number;
  dailyUsage?: number;
  planDailyLimit?: number;
  planCategory?: string;
}

export interface PriceRefreshPreview {
  hasKey: boolean;
  eligibleCount: number;
  skippedCount: number;
  recommendedCount: number;
  maxCount: number;
  creditsPerHolding: number;
  usage?: TwelveDataUsage;
  message?: string;
}

export interface PriceRefreshInput {
  portfolioId: string;
  limit: number;
}

export type PriceRefreshRunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface PriceRefreshRun {
  id: string;
  portfolioId: string;
  status: PriceRefreshRunStatus;
  totalCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  currentSymbol?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

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
  /** USD↔SGD exchange rate: 1 USD = N SGD. Null when not yet set. */
  fxUsdSgdRate?: number;
  /** Date the FX rate was last set (YYYY-MM-DD). */
  fxUsdSgdAsOf?: string;
  /** Provenance: 'manual' (user-entered) or 'frankfurter'. */
  fxUsdSgdSource?: string;
  /** Timestamp when Blurly last refreshed the FX rate from a web provider. */
  fxUsdSgdRefreshedAt?: string;
  /** Days before a holding's price is flagged stale. Null → app default (7). */
  stalenessThresholdDays?: number;
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

/** Light = gpt-4o; Deep = gpt-5.5 with web search forced on. */
export type AnalystPersona = 'light' | 'deep';

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
  persona: AnalystPersona | string;
}

export interface RunAnalysisInput {
  inputContextJson: string;
  analysisType: AnalysisType;
  timeWindow: TimeWindow;
  persona: AnalystPersona;
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
  /** Optional user-defined strategy and milestones. */
  strategy?: AnalysisStrategyContext;
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

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export type InvestorPersonality = 'passive' | 'hybrid' | 'active';

export interface InvestmentStrategy {
  investorPersonality: InvestorPersonality | string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateInvestmentStrategy {
  investorPersonality?: InvestorPersonality;
  notes?: string | null;
}

/** Milestone currency is intentionally restricted to SGD or USD (see currency-scope memory). */
export type MilestoneCurrency = 'SGD' | 'USD';

/** Lucide icon slugs allowed for milestones. Grow the set freely — no DB constraint. */
export const MILESTONE_ICONS = [
  'Home',
  'Plane',
  'GraduationCap',
  'Gem',
  'Baby',
  'Briefcase',
  'PiggyBank',
  'Car',
  'Sparkles',
] as const;
export type MilestoneIcon = (typeof MILESTONE_ICONS)[number];

export interface StrategyMilestone {
  id: string;
  label: string;
  description?: string;
  targetDate: string;
  targetAmount?: number;
  targetCurrency?: string;
  sortOrder: number;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export type NewStrategyMilestone = Omit<StrategyMilestone, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateStrategyMilestone = Partial<{
  label: string;
  description: string | null;
  targetDate: string;
  targetAmount: number | null;
  targetCurrency: string | null;
  sortOrder: number;
  icon: string | null;
}>;

export interface StrategyCashReservation {
  id: string;
  holdingId: string;
  milestoneId: string;
  amount: number;
  currency: MilestoneCurrency;
  notes?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type NewStrategyCashReservation = Omit<
  StrategyCashReservation,
  'id' | 'createdAt' | 'updatedAt'
>;

export type UpdateStrategyCashReservation = Partial<{
  holdingId: string;
  milestoneId: string;
  amount: number;
  currency: MilestoneCurrency;
  notes: string | null;
  sortOrder: number;
}>;

export interface AnalysisMilestoneReservationContext {
  /** Reservation amount in its own currency; only present when includeExactValues. */
  amount?: number;
  currency: string;
  holdingSymbol: string;
  holdingName?: string;
  notes?: string;
}

export interface AnalysisStrategyMilestoneContext {
  label: string;
  description?: string;
  targetDate: string;
  targetAmount?: number;
  targetCurrency?: string;
  countdown: string;
  isOverdue: boolean;
  /** Milestone-linked cash reservations (untouchable cash). */
  reservations?: AnalysisMilestoneReservationContext[];
  /** Sum of reservations converted to targetCurrency; only present when includeExactValues + FX known. */
  totalReservedInTargetCurrency?: number;
  /** True when totalReservedInTargetCurrency could not be computed due to missing FX. */
  fxMissing?: boolean;
}

export interface AnalysisStrategyCashSplitContext {
  /** Base-currency total across Cash/MoneyMarket holdings; only present when includeExactValues. */
  totalCashAndMoneyMarket?: number;
  /** Sum of reservations converted to base currency; only present when includeExactValues + FX known. */
  totalReserved?: number;
  /** totalCashAndMoneyMarket − totalReserved; only present when both above are present. */
  estimatedCashDrag?: number;
  /** True when FX rate is missing so amount-based fields could not be computed. */
  fxMissing?: boolean;
}

export interface AnalysisStrategyContext {
  investorPersonality: string;
  notes?: string;
  milestones: AnalysisStrategyMilestoneContext[];
  cashSplit?: AnalysisStrategyCashSplitContext;
}

// ---------------------------------------------------------------------------
// Analyst chat
// ---------------------------------------------------------------------------

export interface AnalystThread {
  id: string;
  analysisRunId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalystMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | string;
  content: string;
  sourcesJson?: string;
  /** Model id that produced an assistant message ('gpt-4o' | 'gpt-5.5'). */
  responseModel?: string;
  createdAt: string;
}

export interface AnalystThreadDetail {
  thread: AnalystThread;
  messages: AnalystMessage[];
}

export interface NewAnalystThread {
  analysisRunId?: string;
  title?: string;
}

/** Per-follow-up model choice for Ask Analyst. Defaults to gpt-4o server-side. */
export type AskAnalystModel = 'gpt-4o' | 'gpt-5.5';

export interface AskAnalystInput {
  threadId?: string;
  analysisRunId?: string;
  question: string;
  contextJson: string;
  responseModel?: AskAnalystModel;
}

export interface AskAnalystResult {
  thread: AnalystThread;
  userMessage: AnalystMessage;
  assistantMessage: AnalystMessage;
}
