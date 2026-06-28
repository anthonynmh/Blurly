import { invoke } from '@/lib/invoke';
import type { BulkPriceUpdate, Holding, NewHolding, UpdateHolding } from '@/lib/types';

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
};
