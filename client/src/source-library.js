const STORAGE_KEY = 'web-title-pro-source-library';

const normalizeLine = (line) => line.trim();

const detectDelimiter = (text) => {
  if (text.includes('|')) return '|';
  if (text.includes('\t')) return '\t';
  if (text.includes(';')) return ';';
  return ',';
};

const createId = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `src-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const createRowTimer = (timer = {}) => ({
  baseMs: Number(timer.baseMs ?? 0),
  format: timer.format || 'mm:ss',
});

const normalizeLinkedTimerId = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
};

const normalizeLinkedTimerMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, timerId]) => [String(key).trim(), normalizeLinkedTimerId(timerId)])
      .filter(([key, timerId]) => key && timerId),
  );
};

const normalizeRow = (row = {}, index = 0) => ({
  id: row.id || `${createId()}-${index}`,
  index: row.index || index + 1,
  values: Array.isArray(row.values) ? row.values : [],
  label: row.label || (row.values || []).filter(Boolean).slice(0, 2).join(' | ') || `Row ${index + 1}`,
  timer: createRowTimer(row.timer),
});

export const loadSourceLibrary = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    return parsed.map((source) => ({
      ...source,
      linkedTimerId: normalizeLinkedTimerId(source.linkedTimerId),
      linkedTimerByOutput: normalizeLinkedTimerMap(source.linkedTimerByOutput),
      rows: (source.rows || []).map((row, index) => normalizeRow(row, index)),
    }));
  } catch {
    return [];
  }
};

export const saveSourceLibrary = (library) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
};

export const parseSourceText = ({ text, name, templateFields = [] }) => {
  const cleanText = text.replace(/^\uFEFF/, '').trim();

  if (!cleanText) {
    throw new Error('Источник пустой.');
  }

  const delimiter = detectDelimiter(cleanText);
  const lines = cleanText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line && !line.startsWith('#'));

  if (!lines.length) {
    throw new Error('В источнике нет строк с данными.');
  }

  const rows = lines.map((line, index) => {
    const values = line.split(delimiter).map((value) => value.trim());

    return {
      ...normalizeRow({
        id: `${createId()}-${index}`,
        index: index + 1,
        values,
        label: values.filter(Boolean).slice(0, 2).join(' | ') || `Row ${index + 1}`,
      }, index),
    };
  });

  const widestRow = rows.reduce((max, row) => Math.max(max, row.values.length), 0);
  const columnCount = Math.max(widestRow, templateFields.length);
  const columns = Array.from({ length: columnCount }, (_item, index) => ({
    id: `col-${index}`,
    label: templateFields[index]?.label || `Column ${index + 1}`,
  }));

  return {
    id: createId(),
    name: name?.trim() || 'Imported Source',
    delimiter,
    linkedTimerId: null,
    linkedTimerByOutput: {},
    columns,
    rows,
    createdAt: new Date().toISOString(),
  };
};
