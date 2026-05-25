import { useEffect, useState } from 'react';

/**
 * Project-dirty tracker.
 *
 * Given a stable signature string of the *config-relevant* shape (no runtime
 * timer ticks, no program visibility flips) it captures a baseline on first
 * commit and reports whether the current signature differs.
 *
 * Provides a `markClean()` helper that re-baselines after a save.
 */
export function useProjectDirty(currentSignature) {
  const [baseline, setBaseline] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!currentSignature) {
      return;
    }
    // Capture baseline only on first availability.
    setBaseline((current) => current || currentSignature);
  }, [currentSignature]);

  useEffect(() => {
    if (!currentSignature || !baseline) {
      return;
    }
    setDirty(currentSignature !== baseline);
  }, [currentSignature, baseline]);

  const markClean = () => {
    if (currentSignature) {
      setBaseline(currentSignature);
      setDirty(false);
    }
  };

  return { dirty, baseline, markClean, setBaseline, setDirty };
}
