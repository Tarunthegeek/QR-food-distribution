/**
 * Sync manager: flushes offline scan queue → /api/bulk-sync when online.
 * Call `initSyncManager()` once in a client component to start listening.
 */

import { getSyncQueue, markSynced } from './localStorage';

async function flushQueue(): Promise<void> {
  const queue = getSyncQueue();
  const pending = queue.filter((r) => !r.synced);
  if (pending.length === 0) return;

  try {
    const res = await fetch('/api/bulk-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: pending }),
    });

    let payload: { success?: boolean; syncedKeys?: string[] } = {};
    try {
      payload = await res.json();
    } catch {
      /* non-JSON body */
    }

    if (res.ok && payload.success && Array.isArray(payload.syncedKeys)) {
      markSynced(payload.syncedKeys);
      if (payload.syncedKeys.length > 0) {
        console.log(`[SyncManager] Synced ${payload.syncedKeys.length} offline records.`);
      }
    }
  } catch {
    // Still offline – will retry on next online event
  }
}

/** Call once from a client component (e.g., root layout) */
export function initSyncManager(): () => void {
  if (typeof window === 'undefined') return () => {};

  // Try immediately in case we're already online
  flushQueue();

  const handler = () => flushQueue();
  window.addEventListener('online', handler);

  // Cleanup function
  return () => window.removeEventListener('online', handler);
}
