'use client';

/**
 * ServiceWorkerRegistrar – registers sw.js on mount.
 * Import once from root layout or a top-level component.
 */

import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => console.log('[SW] Registered'))
        .catch((err) => console.warn('[SW] Registration failed', err));
    }
  }, []);

  return null;
}
