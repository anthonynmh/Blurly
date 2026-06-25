import { invoke } from '@/lib/invoke';
import type { NewWatchlistItem, UpdateWatchlistItem, WatchlistItem } from '@/lib/types';

export const watchlistService = {
  list(): Promise<WatchlistItem[]> {
    return invoke('list_watchlist');
  },

  create(input: NewWatchlistItem): Promise<WatchlistItem> {
    return invoke('create_watchlist_item', { input });
  },

  update(id: string, input: UpdateWatchlistItem): Promise<WatchlistItem> {
    return invoke('update_watchlist_item', { id, input });
  },

  delete(id: string): Promise<void> {
    return invoke('delete_watchlist_item', { id });
  },
};
