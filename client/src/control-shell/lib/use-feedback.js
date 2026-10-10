import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Toast-style transient feedback message.
 *
 * Two levels: `pushFeedback` (info — "Project saved", "Row applied") and
 * `pushError` (failures, and "can't do that because…" guards). The operator
 * picks which ones are shown in Settings › System › Notifications:
 * all / errors only / none. The choice is a per-machine UI preference, so it
 * lives in localStorage (like Live-edit), not in the project.
 *
 * Calls auto-clear after a delay (errors stay a bit longer). The pending
 * timeout is cleared on unmount so the setter never fires on a dead tree.
 */
export const FEEDBACK_MODES = ['all', 'errors', 'none'];
const FEEDBACK_MODE_STORAGE_KEY = 'wtp.notifications';

const loadFeedbackMode = () => {
  try {
    const value = window.localStorage.getItem(FEEDBACK_MODE_STORAGE_KEY);
    return FEEDBACK_MODES.includes(value) ? value : 'all';
  } catch {
    return 'all';
  }
};

export const shouldShowFeedback = (mode, level) =>
  mode === 'all' || (mode === 'errors' && level === 'error');

export function useFeedback({ infoMs = 2600, errorMs = 5000 } = {}) {
  const [feedback, setFeedback] = useState(null);
  const [feedbackMode, setFeedbackModeState] = useState(loadFeedbackMode);
  const modeRef = useRef(feedbackMode);
  const timerRef = useRef(null);

  const show = useCallback(
    (message, level) => {
      if (!message || !shouldShowFeedback(modeRef.current, level)) return;
      setFeedback({ message: String(message), level });
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setFeedback(null), level === 'error' ? errorMs : infoMs);
    },
    [errorMs, infoMs],
  );

  const pushFeedback = useCallback((message) => show(message, 'info'), [show]);
  const pushError = useCallback((message) => show(message, 'error'), [show]);

  const setFeedbackMode = useCallback((mode) => {
    const next = FEEDBACK_MODES.includes(mode) ? mode : 'all';
    modeRef.current = next;
    setFeedbackModeState(next);
    setFeedback((current) => (current && shouldShowFeedback(next, current.level) ? current : null));
    try {
      window.localStorage.setItem(FEEDBACK_MODE_STORAGE_KEY, next);
    } catch {}
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return { feedback, pushFeedback, pushError, feedbackMode, setFeedbackMode };
}
