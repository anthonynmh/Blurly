import { invoke } from '@/lib/invoke';
import type {
  BulkPriceUpdate,
  Holding,
  NewHolding,
  PriceRefreshInput,
  PriceRefreshPreview,
  PriceRefreshRunResult,
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

  refreshPricesFromTwelveData(input: PriceRefreshInput): Promise<PriceRefreshRunResult> {
    return invoke('refresh_prices_from_twelve_data', { input });
  },
};
