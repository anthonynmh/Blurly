import { invoke } from '@/lib/invoke';
import type { Portfolio } from '@/lib/types';

export const portfolioService = {
  getDefault(): Promise<Portfolio> {
    return invoke('get_default_portfolio');
  },

  get(id: string): Promise<Portfolio> {
    return invoke('get_portfolio', { id });
  },
};
