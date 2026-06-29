import { invoke } from '@/lib/invoke';
import type {
  BulkPriceUpdate,
  Holding,
  NewHolding,
  PriceRefreshInput,
  PriceRefreshPreview,
  PriceRefreshRun,
  UpdateHolding,
} from '@/lib/types';

export const holdingService = {
  list(portfolioId: string): Promise<Holding[]> {
    return invoke('list_holdings', { portfolioId });
  },

  get(id: string): Promise<Holding | null> {
    return invoke('get_holding', { id });
  },

  create(input: NewHolding): Promise<Holding> {
    return invoke('create_holding', { input });
  },

  update(id: string, input: UpdateHolding): Promise<Holding> {
    return invoke('update_holding', { id, input });
  },

  delete(id: string): Promise<void> {
    return invoke('delete_holding', { id });
  },

  updatePricesBulk(updates: BulkPriceUpdate[]): Promise<void> {
    return invoke('update_prices_bulk', { updates });
  },

  getTwelveDataRefreshPreview(portfolioId: string): Promise<PriceRefreshPreview> {
    return invoke('get_twelve_data_refresh_preview', { portfolioId });
  },

  /** Kicks off a background refresh and returns the new run id immediately. */
  startPriceRefresh(input: PriceRefreshInput): Promise<string> {
    return invoke('start_price_refresh', { input });
  },

  /** Returns the row whose status is 'running' for the portfolio, or null. */
  getActivePriceRefreshRun(portfolioId: string): Promise<PriceRefreshRun | null> {
    return invoke('get_active_price_refresh_run', { portfolioId });
  },

  /** Returns the most recent run row regardless of status. */
  getLatestPriceRefreshRun(portfolioId: string): Promise<PriceRefreshRun | null> {
    return invoke('get_latest_price_refresh_run', { portfolioId });
  },
};
