import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const TRIGGER_PX = 70;   // pull distance that triggers a refresh
const MAX_PULL_PX = 110; // visual clamp so the indicator doesn't run away
const WHEEL_COOLDOWN_MS = 900;

interface Props {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
}

/**
 * Wraps the feed with an iOS-style pull-to-refresh gesture.
 * - Mobile: touch drag down when scrolled to top.
 * - Desktop: upward wheel/trackpad over-scroll while scrollY === 0.
 */
export function PullToRefresh({ onRefresh, children }: Props) {
  const { t } = useTranslation();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const wheelAccum = useRef(0);
  const wheelResetTimer = useRef<number | null>(null);
  const lastRefreshAt = useRef(0);

  const atTop = () => (window.scrollY || document.documentElement.scrollTop) <= 0;

  const fire = useCallback(async () => {
    if (refreshing) return;
    const now = Date.now();
    if (now - lastRefreshAt.current < WHEEL_COOLDOWN_MS) return;
    lastRefreshAt.current = now;
    setRefreshing(true);
    setPull(TRIGGER_PX);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPull(0);
      wheelAccum.current = 0;
    }
  }, [onRefresh, refreshing]);

  // Touch gesture
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (!atTop() || refreshing) { touchStartY.current = null; return; }
      touchStartY.current = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY.current === null || refreshing) return;
      const delta = e.touches[0].clientY - touchStartY.current;
      if (delta <= 0) { setPull(0); return; }
      // Dampened pull (resistance as you pull further)
      const damped = Math.min(MAX_PULL_PX, delta * 0.5);
      setPull(damped);
    };
    const onTouchEnd = () => {
      if (touchStartY.current === null) return;
      touchStartY.current = null;
      if (pull >= TRIGGER_PX) void fire();
      else setPull(0);
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [pull, fire, refreshing]);

  // Wheel / trackpad over-scroll
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!atTop() || refreshing) return;
      if (e.deltaY >= 0) {
        // Downward scroll — don't accumulate
        wheelAccum.current = 0;
        setPull(0);
        return;
      }
      // User is pushing up while already at the top
      wheelAccum.current += Math.abs(e.deltaY);
      const damped = Math.min(MAX_PULL_PX, wheelAccum.current * 0.6);
      setPull(damped);

      if (wheelResetTimer.current) window.clearTimeout(wheelResetTimer.current);
      if (wheelAccum.current >= TRIGGER_PX * 1.7) {
        void fire();
        return;
      }
      // If the user stops scrolling without hitting the threshold, reset.
      wheelResetTimer.current = window.setTimeout(() => {
        wheelAccum.current = 0;
        setPull(0);
      }, 250);
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      if (wheelResetTimer.current) window.clearTimeout(wheelResetTimer.current);
    };
  }, [fire, refreshing]);

  const progress = Math.min(1, pull / TRIGGER_PX);
  const label = refreshing
    ? t('ptr.refreshing')
    : progress >= 1
      ? t('ptr.release')
      : t('ptr.pull');

  return (
    <div className="ptr" style={{ transform: `translateY(${pull}px)`, transition: pull === 0 || refreshing ? 'transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none' }}>
      <div
        className={`ptr__indicator${refreshing ? ' ptr__indicator--spinning' : ''}`}
        style={{ opacity: Math.min(1, progress + (refreshing ? 1 : 0)), top: `-${MAX_PULL_PX - pull + 20}px` }}
      >
        <div
          className="ptr__spinner"
          style={{ transform: refreshing ? undefined : `rotate(${progress * 360}deg)` }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </div>
        <span className="ptr__label">{label}</span>
      </div>
      {children}
    </div>
  );
}
