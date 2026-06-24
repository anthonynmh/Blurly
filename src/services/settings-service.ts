import { invoke } from '@/lib/invoke';
import type { Settings } from '@/lib/types';

export interface UpdateSettingsInput {
  portfolioName?: string;
  baseCurrency?: string;
  defaultCurrency?: string;
}

export const settingsService = {
  get(): Promise<Settings> {
    return invoke('get_settings');
  },

  update(input: UpdateSettingsInput): Promise<Settings> {
    return invoke('update_settings', { input });
  },
};
