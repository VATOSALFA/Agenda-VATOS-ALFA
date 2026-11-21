'use client';

import { useEffect } from 'react';

const GADS_ID = 'AW-17117243647';

export function GoogleAdsScript() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    if (typeof w.gtag !== 'function') {
      w.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        w.dataLayer.push(arguments);
      };
      w.gtag('js', new Date());
      w.gtag('config', GADS_ID);
    }

    let loaded = false;
    const loadGtagScript = () => {
      if (loaded) return;
      loaded = true;
      cleanup();

      if (document.querySelector(`script[src*="googletagmanager.com/gtag/js"]`)) {
        return;
      }

      const script = document.createElement('script');
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GADS_ID}`;
      script.async = true;
      document.head.appendChild(script);
    };

    const events = ['pointerdown', 'touchstart', 'scroll', 'keydown'] as const;
    const cleanup = () => {
      events.forEach((evt) => window.removeEventListener(evt, loadGtagScript));
      clearTimeout(fallbackTimer);
    };

    events.forEach((evt) =>
      window.addEventListener(evt, loadGtagScript, { once: true, passive: true })
    );
    const fallbackTimer = setTimeout(loadGtagScript, 4500);

    return cleanup;
  }, []);

  return null;
}
