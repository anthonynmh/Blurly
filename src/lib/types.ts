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
