import { invoke } from '@/lib/invoke';
import type { ApiKeyStatus, SigningIdentity, TestConnectionResult } from '@/lib/types';

/**
 * BYOK key storage. Keys live in an encrypted file under the app data
 * directory (ChaCha20-Poly1305 with a machine-bound BLAKE3-derived key) —
 * never in SQLite, never exposed back to JS.
 */
export const aiKeysService = {
  set(provider: string, key: string): Promise<ApiKeyStatus> {
    return invoke('set_api_key', { provider, key: key.trim() });
  },

  delete(provider: string): Promise<void> {
    return invoke('delete_api_key', { provider });
  },

  status(provider: string): Promise<ApiKeyStatus> {
    return invoke('get_api_key_status', { provider });
  },

  has(provider: string): Promise<boolean> {
    return invoke('has_api_key', { provider });
  },

  test(provider: string, key: string, model: string): Promise<TestConnectionResult> {
    return invoke('test_api_key', { provider, key: key.trim(), model });
  },

  signingIdentity(): Promise<SigningIdentity> {
    return invoke('get_app_signing_identity');
  },
};
