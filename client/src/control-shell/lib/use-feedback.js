import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Toast-style transient feedback message.
 *
 * Calls auto-clear after `clearAfterMs` milliseconds. The pending timeout is
 * cleared on unmount so the setter never fires on a dead tree.
 */
export function useFeedback(clearAfterMs = 2600) {
  const [feedback, setFeedback] = useState('');
  const timerRef = useRef(null);

  const pushFeedback = useCallback(
    (message) => {
      setFeedback(message);
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setFeedback(''), clearAfterMs);
    },
    [clearAfterMs],
  );

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return [feedback, pushFeedback];
}
