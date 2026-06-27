import { invoke } from '@/lib/invoke';
import type { AiSettings, UpdateAiSettings } from '@/lib/types';

export const aiSettingsService = {
  get(): Promise<AiSettings> {
    return invoke('get_ai_settings');
  },

  update(input: UpdateAiSettings): Promise<AiSettings> {
    return invoke('update_ai_settings', { input });
  },
};
