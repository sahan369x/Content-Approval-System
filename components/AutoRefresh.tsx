'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Keeps the board fresh: re-fetches every 30s while the tab is visible, and when the tab regains focus. */
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = setInterval(tick, seconds * 1000);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, [router, seconds]);

  return null;
}
