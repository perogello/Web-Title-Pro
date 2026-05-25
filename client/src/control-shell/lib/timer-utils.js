// Pure timer-related helpers extracted from ControlShell.jsx.
// No React, no DOM, no side effects — safe to unit-test in isolation.

export const LINKED_TIMER_OVERRIDE_MS = 1800;
export const TIMER_MAX_MS = (99 * 3600 + 59 * 60 + 59) * 1000;
export const TIMER_SEGMENT_STEP_MS = {
  hours: 3600000,
  minutes: 60000,
  seconds: 1000,
};
export const TIMER_FORMATS = ['hh:mm:ss', 'mm:ss', 'ss'];

export const normalizeLinkedTimerId = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
};

export const timerIdMatches = (timer, linkedTimerId) =>
  normalizeLinkedTimerId(timer?.id) === normalizeLinkedTimerId(linkedTimerId);

export const getSourceLinkedTimerId = (source, outputId = null) => {
  if (!source) {
    return null;
  }

  const normalizedOutputId = outputId ? String(outputId).trim() : '';
  if (normalizedOutputId && source.linkedTimerByOutput?.[normalizedOutputId]) {
    return normalizeLinkedTimerId(source.linkedTimerByOutput[normalizedOutputId]);
  }

  return normalizeLinkedTimerId(source.linkedTimerId);
};

export const getLinkedTimerStatus = (timer, fallbackBaseMs = 0) => {
  if (!timer) {
    return 'idle';
  }

  const currentMs = Number(timer.currentMs ?? timer.valueMs ?? 0);
  const referenceMs = Number(
    timer.mode === 'countup'
      ? timer.valueMs ?? fallbackBaseMs
      : timer.durationMs ?? fallbackBaseMs,
  );

  if (timer.running) {
    return 'running';
  }

  if (currentMs === 0 && timer.mode !== 'countup') {
    return 'finished';
  }

  if (timer.mode === 'countup') {
    return currentMs > 0 ? 'paused' : 'idle';
  }

  return currentMs !== referenceMs ? 'paused' : 'idle';
};

export const formatStatusTime = (value) =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));

export const formatCompactTimer = (milliseconds, format = 'mm:ss') => {
  const safeMilliseconds = Math.max(0, milliseconds);
  const totalSeconds = Math.floor(safeMilliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const fullMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (format === 'hh:mm:ss') {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  if (format === 'ss') {
    return String(totalSeconds).padStart(2, '0');
  }

  return `${String(fullMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const changeTimerSegment = (milliseconds, segment, delta) => {
  const stepMs = TIMER_SEGMENT_STEP_MS[segment] || 0;
  const currentMs = Math.max(0, Number(milliseconds || 0));

  if (!stepMs) {
    return Math.min(TIMER_MAX_MS, currentMs);
  }

  return Math.max(0, Math.min(TIMER_MAX_MS, currentMs + delta * stepMs));
};

export const getTimerSegments = (milliseconds, format = 'mm:ss') => {
  const safeMilliseconds = Math.max(0, milliseconds);
  const totalSeconds = Math.floor(safeMilliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const fullMinutes = Math.floor(totalSeconds / 60);
  const normalizedMinutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (format === 'hh:mm:ss') {
    return [
      { key: 'hours', value: String(hours).padStart(2, '0') },
      { key: 'minutes', value: String(normalizedMinutes).padStart(2, '0') },
      { key: 'seconds', value: String(seconds).padStart(2, '0') },
    ];
  }

  if (format === 'ss') {
    return [{ key: 'seconds', value: String(totalSeconds).padStart(2, '0') }];
  }

  return [
    { key: 'minutes', value: String(fullMinutes).padStart(2, '0') },
    { key: 'seconds', value: String(seconds).padStart(2, '0') },
  ];
};
