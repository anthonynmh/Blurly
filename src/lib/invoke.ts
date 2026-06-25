// NOTE: In Tauri v2, invoke is at @tauri-apps/api/core — NOT @tauri-apps/api
import { invoke as tauriInvoke } from '@tauri-apps/api/core';

/**
 * Thin wrapper around tauriInvoke that normalises string errors from Rust
 * into proper JS Error objects.
 */
export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await tauriInvoke<T>(cmd, args);
  } catch (err) {
    if (typeof err === 'string') {
      throw new Error(err);
    }
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Unknown IPC error');
  }
}
