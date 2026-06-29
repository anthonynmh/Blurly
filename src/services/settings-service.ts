import { invoke } from '@/lib/invoke';
import type { Settings } from '@/lib/types';

export interface UpdateSettingsInput {
  portfolioName?: string;
  baseCurrency?: string;
  defaultCurrency?: string;
  /** USD↔SGD exchange rate: 1 USD = N SGD. */
  fxUsdSgdRate?: number | null;
  /** Date the FX rate was last set (YYYY-MM-DD). */
  fxUsdSgdAsOf?: string | null;
  /** Provenance: 'manual' when set by the user; 'frankfurter' when refreshed on launch. */
  fxUsdSgdSource?: string | null;
  /** Timestamp when Blurly last refreshed the FX rate from a web provider. */
  fxUsdSgdRefreshedAt?: string | null;
  /** Days before a holding's price is flagged stale. Null → app default (7). */
  stalenessThresholdDays?: number;
}

export const settingsService = {
  get(): Promise<Settings> {
    return invoke('get_settings');
  },

  update(input: UpdateSettingsInput): Promise<Settings> {
    return invoke('update_settings', { input });
  },

  refreshFxRate(): Promise<Settings> {
    return invoke('refresh_fx_rate');
  },
};
