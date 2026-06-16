/**
 * localStorage utilities for offline-first QR scan tracking.
 * Keys are "ID|MEAL" so the same wristband can be scanned once per serving line.
 */

const SCANNED_KEY    = 'qr_scanned_ids';
const SYNC_QUEUE_KEY = 'qr_sync_queue';

export interface LocalScanRecord {
  id: string;
  meal: string;
  scanned_at: string;
  synced: boolean;
}

export function localScanCompositeKey(id: string, meal: string): string {
  return `${id.trim().toUpperCase()}|${meal.trim().toUpperCase()}`;
}

function migrateLegacyStore(
  store: Record<string, { meal?: string; scanned_at?: string }>,
): Record<string, { scanned_at: string }> {
  const out: Record<string, { scanned_at: string }> = {};
  for (const [key, v] of Object.entries(store)) {
    if (!v) continue;
    const at = v.scanned_at || new Date().toISOString();
    if (key.includes('|')) {
      const [a, ...rest] = key.split('|');
      out[localScanCompositeKey(a, rest.join('|'))] = { scanned_at: at };
      continue;
    }
    if (v.meal) out[localScanCompositeKey(key, v.meal)] = { scanned_at: at };
  }
  return out;
}

function getScannedStore(): Record<string, { scanned_at: string }> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(SCANNED_KEY) || '{}') as Record<
      string,
      { meal?: string; scanned_at?: string }
    >;
    const migrated = migrateLegacyStore(raw);
    if (JSON.stringify(migrated) !== JSON.stringify(raw)) {
      localStorage.setItem(SCANNED_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    return {};
  }
}

/** True if this id+meal combo was already scanned on this device */
export function isScannedLocally(id: string, meal: string): boolean {
  if (typeof window === 'undefined') return false;
  const store = getScannedStore();
  return !!store[localScanCompositeKey(id, meal)];
}

export function markScannedLocally(id: string, meal: string): void {
  if (typeof window === 'undefined') return;
  const store = getScannedStore();
  store[localScanCompositeKey(id, meal)] = { scanned_at: new Date().toISOString() };
  localStorage.setItem(SCANNED_KEY, JSON.stringify(store));
}

/** After admin reset: allow all serving lines again for this participant on this device */
export function removeFromLocalCache(id: string): void {
  if (typeof window === 'undefined') return;
  const uid = id.toUpperCase();
  const store = getScannedStore();
  const prefix = `${uid}|`;
  for (const k of Object.keys(store)) {
    if (k === uid || k.startsWith(prefix)) delete store[k];
  }
  localStorage.setItem(SCANNED_KEY, JSON.stringify(store));

  const queue = getSyncQueue().filter((r) => r.id.toUpperCase() !== uid);
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

export function addToSyncQueue(record: Omit<LocalScanRecord, 'synced'>): void {
  if (typeof window === 'undefined') return;
  const queue = getSyncQueue();
  const dup = queue.some(
    (r) =>
      r.id.toUpperCase() === record.id.toUpperCase() &&
      r.meal.toUpperCase() === record.meal.toUpperCase(),
  );
  if (!dup) queue.push({ ...record, synced: false });
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

export function getSyncQueue(): LocalScanRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

/** `syncedKeys` entries are "ID|MEAL" (uppercase) from /api/bulk-sync */
export function markSynced(syncedKeys: string[]): void {
  if (typeof window === 'undefined') return;
  const keys = new Set(syncedKeys.map((k) => k.toUpperCase()));
  const queue = getSyncQueue().filter(
    (r) => !keys.has(localScanCompositeKey(r.id, r.meal)),
  );
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

export function clearLocalData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SCANNED_KEY);
  localStorage.removeItem(SYNC_QUEUE_KEY);
}

export function getLocalScanCount(): number {
  if (typeof window === 'undefined') return 0;
  return Object.keys(getScannedStore()).length;
}
