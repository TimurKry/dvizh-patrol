'use client';

import { useEffect } from 'react';

/**
 * Регистрация service worker.
 *
 * В разработке не регистрируется: кэш оболочки сбивает с толку
 * при отладке сильнее, чем помогает.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Регистрация не обязательна: без неё приложение работает,
        // просто хуже переносит обрывы связи.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
