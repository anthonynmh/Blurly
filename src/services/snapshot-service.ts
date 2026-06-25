import { invoke } from '@/lib/invoke';
import type { PortfolioSnapshot, SnapshotMeta } from '@/lib/types';

export interface NewSnapshotInput {
  portfolioId: string;
  snapshotDate: string;
  totalValue: number;
  /** JSON-stringified PortfolioSnapshot */
  snapshotJson: string;
}

export const snapshotService = {
  create(input: NewSnapshotInput): Promise<SnapshotMeta> {
    return invoke('create_snapshot', { input });
  },

  list(portfolioId: string): Promise<SnapshotMeta[]> {
    return invoke('list_snapshots', { portfolioId });
  },

  get(id: string): Promise<PortfolioSnapshot> {
    return invoke('get_snapshot', { id });
  },

  delete(id: string): Promise<void> {
    return invoke('delete_snapshot', { id });
  },
};
