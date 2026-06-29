import { invoke } from '@/lib/invoke';
import type { ApiKeyStatus, TestConnectionResult } from '@/lib/types';

export const twelveDataService = {
  setKey(key: string): Promise<ApiKeyStatus> {
    return invoke('set_twelve_data_api_key', { key: key.trim() });
  },

  deleteKey(): Promise<void> {
    return invoke('delete_twelve_data_api_key');
  },

  keyStatus(): Promise<ApiKeyStatus> {
    return invoke('get_twelve_data_api_key_status');
  },

  testKey(key: string): Promise<TestConnectionResult> {
    return invoke('test_twelve_data_api_key', { key: key.trim() });
  },
};
