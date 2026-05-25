// Pure entry / template-field helpers extracted from ControlShell.jsx.
// No React, no DOM. Used by the shell and by tab components.

export const VMIX_TITLE_ACTIONS = [
  { value: 'TransitionIn', label: 'TransitionIn' },
  { value: 'TransitionOut', label: 'TransitionOut' },
  { value: 'none', label: 'No Action' },
];

export const normalizeVmixTitleAction = (value, fallback) => {
  const normalizedValue =
    value === 'TitleBeginAnimation'
      ? 'TransitionIn'
      : value === 'TitleEndAnimation'
        ? 'TransitionOut'
        : value;
  const normalizedFallback =
    fallback === 'TitleBeginAnimation'
      ? 'TransitionIn'
      : fallback === 'TitleEndAnimation'
        ? 'TransitionOut'
        : fallback;
  return VMIX_TITLE_ACTIONS.some((action) => action.value === normalizedValue)
    ? normalizedValue
    : normalizedFallback;
};

export const createClientId = (prefix = 'item') => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

export const slugFieldKey = (value = '') =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `field_${Math.random().toString(16).slice(2, 6)}`;

export const getSourceRowEditKey = (sourceId, rowId) => `${sourceId}:${rowId}`;

export const buildEffectiveLocalFieldMap = (entry, templateFields = []) => {
  const existing = Array.isArray(entry?.localFieldMap) ? entry.localFieldMap : [];
  const mapByName = new Map(existing.filter((item) => item?.name).map((item) => [item.name, item]));

  return templateFields.map((field, index) => {
    const mapped = mapByName.get(field.name);
    const sourceColumnIndex = Number.isInteger(mapped?.sourceColumnIndex)
      ? mapped.sourceColumnIndex
      : Number.parseInt(mapped?.sourceColumnIndex ?? '', 10);

    return {
      name: field.name,
      label: field.label || field.name,
      sourceColumnIndex: Number.isFinite(sourceColumnIndex) ? sourceColumnIndex : index,
    };
  });
};

export const buildEffectiveVmixFieldMap = (entry, templateFields = []) => {
  const existing = Array.isArray(entry?.vmixFieldMap) ? entry.vmixFieldMap : [];
  const mapByName = new Map(existing.filter((item) => item?.name).map((item) => [item.name, item]));

  return templateFields.map((field, index) => {
    const mapped = mapByName.get(field.name);
    const sourceColumnIndex = Number.isInteger(mapped?.sourceColumnIndex)
      ? mapped.sourceColumnIndex
      : Number.parseInt(mapped?.sourceColumnIndex ?? '', 10);

    return {
      name: field.name,
      label: field.label || field.name,
      vmixFieldName: mapped?.vmixFieldName || field.label || field.name,
      sourceColumnIndex: Number.isFinite(sourceColumnIndex) ? sourceColumnIndex : index,
    };
  });
};

export const buildEffectiveEntryFieldMap = (entry, templateFields = []) =>
  entry?.entryType === 'vmix'
    ? buildEffectiveVmixFieldMap(entry, templateFields)
    : buildEffectiveLocalFieldMap(entry, templateFields);

export const buildFieldMapSignature = (fieldMap = []) =>
  JSON.stringify(
    (Array.isArray(fieldMap) ? fieldMap : []).map((field) => ({
      name: field?.name || '',
      sourceColumnIndex: Number.isFinite(Number(field?.sourceColumnIndex))
        ? Number(field.sourceColumnIndex)
        : null,
      vmixFieldName: field?.vmixFieldName || '',
    })),
  );

export const applyRowToFields = (templateFields, rowValues, currentFields, fieldMap = null) => {
  const nextFields = { ...currentFields };
  const mapByName = new Map(
    Array.isArray(fieldMap)
      ? fieldMap.filter((item) => item?.name).map((item) => [item.name, item])
      : [],
  );

  templateFields.forEach((field, index) => {
    const mapped = mapByName.get(field.name);
    const sourceColumnIndex = Number.isInteger(mapped?.sourceColumnIndex)
      ? mapped.sourceColumnIndex
      : Number.parseInt(mapped?.sourceColumnIndex ?? '', 10);
    const resolvedIndex =
      Number.isFinite(sourceColumnIndex) && sourceColumnIndex >= 0 ? sourceColumnIndex : null;
    nextFields[field.name] = resolvedIndex === null ? '' : rowValues[resolvedIndex] ?? '';
  });

  return nextFields;
};

export const getEntryDataPreview = (entry) => {
  const values = Object.values(entry?.fields || {})
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  return values.slice(0, 2).join(' / ');
};

export const getRundownPrimaryLabel = (entry) =>
  entry?.entryType === 'vmix'
    ? entry?.vmixInputTitle || entry?.templateName || entry?.name || 'vMix Title'
    : entry?.templateName || entry?.name || 'Local Title';

export const getRundownSecondaryLabel = (entry) => {
  const preview = getEntryDataPreview(entry);

  if (preview && preview !== getRundownPrimaryLabel(entry)) {
    return preview;
  }

  if (entry?.name && entry.name !== getRundownPrimaryLabel(entry)) {
    return entry.name;
  }

  return '';
};

export const supportsFieldStyleEditor = (template = null, entry = null) => {
  if (entry?.entryType === 'vmix') {
    return false;
  }

  const fieldNames = (template?.fields || entry?.templateFields || [])
    .map((field) => String(field?.name || '').toLowerCase())
    .filter(Boolean);
  return Boolean(template?.fieldStyleEditor === true && fieldNames.length > 0);
};

export const normalizeLocalFieldStyles = (templateFields = [], styles = {}) =>
  Object.fromEntries(
    (Array.isArray(templateFields) ? templateFields : [])
      .map((field) => {
        const style = styles?.[field.name] || {};
        const fontFamily = typeof style.fontFamily === 'string' ? style.fontFamily.trim() : '';
        const fontSourcePath =
          typeof style.fontSourcePath === 'string' ? style.fontSourcePath.trim() : '';
        const fontSize = Number.parseInt(style.fontSize ?? '', 10);
        const color = typeof style.color === 'string' ? style.color.trim() : '';

        return [
          field.name,
          {
            ...(fontFamily ? { fontFamily } : {}),
            ...(fontSourcePath ? { fontSourcePath } : {}),
            ...(Number.isFinite(fontSize) && fontSize > 0 ? { fontSize } : {}),
            ...(color ? { color } : {}),
          },
        ];
      })
      .filter(([, style]) => Object.keys(style).length > 0),
  );

export const buildVmixEntryConfig = (input) => {
  const textFields = input?.textFields?.length ? input.textFields : [{ name: 'Text', index: '0' }];
  const usedKeys = new Set();
  const fieldMap = textFields.map((field, index) => {
    let key = slugFieldKey(field.name || `field_${index + 1}`);

    while (usedKeys.has(key)) {
      key = `${key}_${index + 1}`;
    }

    usedKeys.add(key);
    return {
      name: key,
      label: field.name || `Field ${index + 1}`,
      vmixFieldName: field.name || 'Text',
      index: field.index || String(index),
      sourceColumnIndex: index,
    };
  });

  return {
    fieldMap,
    fields: Object.fromEntries(fieldMap.map((field) => [field.name, ''])),
  };
};

export const buildPersistedEntry = (entry = {}) => {
  const base = {
    id: entry.id,
    entryType: entry.entryType === 'vmix' ? 'vmix' : 'local',
    templateId: entry.entryType === 'vmix' ? null : entry.templateId,
    name: entry.name || '',
    fields: entry.fields || {},
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null,
    shortcuts: entry.shortcuts || { show: '', live: '', hide: '' },
  };

  if (entry.entryType === 'vmix') {
    return {
      ...base,
      vmixInputKey: entry.vmixInputKey || null,
      vmixInputNumber: entry.vmixInputNumber || null,
      vmixInputTitle: entry.vmixInputTitle || '',
      vmixFieldMap: Array.isArray(entry.vmixFieldMap) ? entry.vmixFieldMap : [],
      vmixShowAction: entry.vmixShowAction || 'TransitionIn',
      vmixHideAction: entry.vmixHideAction || 'TransitionOut',
    };
  }

  return {
    ...base,
    localFieldMap: Array.isArray(entry.localFieldMap) ? entry.localFieldMap : [],
  };
};

export const buildPersistedTimer = (timer = {}) => ({
  id: timer.id,
  name: timer.name || 'New Timer',
  mode: timer.mode === 'countup' ? 'countup' : 'countdown',
  durationMs: Number(timer.durationMs ?? 0),
  valueMs: Number(timer.valueMs ?? 0),
  running: Boolean(timer.running),
  startedAt: timer.startedAt || null,
  sourceType: timer.sourceType === 'vmix' ? 'vmix' : 'local',
  targetOutputId: timer.targetOutputId || null,
  targetTemplateId: timer.targetTemplateId || null,
  targetTimerId: timer.targetTimerId || null,
  vmixInputKey: timer.vmixInputKey || null,
  vmixTextField: timer.vmixTextField || 'Text',
  displayFormat: timer.displayFormat || 'mm:ss',
});

const FONT_STYLE_HINTS = [
  'thin',
  'extralight',
  'light',
  'regular',
  'medium',
  'semibold',
  'bold',
  'extrabold',
  'black',
  'italic',
];

export const pickPreferredFontFile = (fontName, filePaths = []) => {
  const normalizedFontName = String(fontName || '').toLowerCase();
  const desiredHints = FONT_STYLE_HINTS.filter((hint) => normalizedFontName.includes(hint));
  const candidates = (Array.isArray(filePaths) ? filePaths : [])
    .map((filePath) => String(filePath || '').trim())
    .filter(Boolean);

  if (!candidates.length) {
    return '';
  }

  const scoreFile = (filePath) => {
    const normalizedPath = filePath.toLowerCase();
    let score = 0;

    if (desiredHints.length) {
      desiredHints.forEach((hint) => {
        if (normalizedPath.includes(hint)) {
          score += 6;
        }
      });
    } else {
      if (normalizedPath.includes('regular')) score += 6;
      if (normalizedPath.includes('variablefont_wght') && !normalizedPath.includes('italic')) score += 5;
      if (!/(italic|bold|black|light|thin|medium|semibold|extrabold)/.test(normalizedPath)) score += 4;
    }

    if (!normalizedPath.includes('italic')) score += 2;
    if (!normalizedPath.includes('bold')) score += 1;
    if (normalizedPath.endsWith('.ttf')) score += 1;

    return score;
  };

  return [...candidates].sort((left, right) => scoreFile(right) - scoreFile(left))[0] || candidates[0];
};

export const buildUploadFormData = (files, name) => {
  const formData = new FormData();

  if (name.trim()) {
    formData.append('name', name.trim());
  }

  files.forEach((file) => {
    formData.append('files', file, file.webkitRelativePath || file.name);
  });

  return formData;
};

export const isVmixTitleInput = (input) => {
  if (!input) {
    return false;
  }

  const title = `${input.title || ''} ${input.shortTitle || ''}`.toLowerCase();
  const type = String(input.type || '').toLowerCase();
  const hasTextFields = Array.isArray(input.textFields) && input.textFields.length > 0;

  return (
    hasTextFields &&
    (title.includes('.gtzip') || title.includes('.gt') || type.includes('gt') || type.includes('title'))
  );
};

const LIVE_SOURCE_COLUMN_WIDTHS_KEY = 'web-title-pro.liveSourceColumnWidths';

export const loadLiveSourceColumnWidths = () => {
  try {
    const raw = window.localStorage.getItem(LIVE_SOURCE_COLUMN_WIDTHS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const saveLiveSourceColumnWidths = (widths) => {
  try {
    window.localStorage.setItem(LIVE_SOURCE_COLUMN_WIDTHS_KEY, JSON.stringify(widths || {}));
  } catch {}
};
