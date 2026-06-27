import { invoke } from '@/lib/invoke';
import type { TestConnectionResult } from '@/lib/types';

/**
 * BYOK key storage. Keys live in the OS keychain (macOS Keychain via the
 * Rust `keyring` crate) — never in SQLite, never exposed back to JS.
 */
export const aiKeysService = {
  set(provider: string, key: string): Promise<void> {
    return invoke('set_api_key', { provider, key });
  },

  delete(provider: string): Promise<void> {
    return invoke('delete_api_key', { provider });
  },

  has(provider: string): Promise<boolean> {
    return invoke('has_api_key', { provider });
  },

  test(provider: string, key: string, model: string): Promise<TestConnectionResult> {
    return invoke('test_api_key', { provider, key, model });
  },
};
