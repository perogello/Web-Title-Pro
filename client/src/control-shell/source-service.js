import { createRemoteSourceConfig, parseSourceText } from '../source-library.js';
import { getRemoteSourceTypeLabel, normalizeRemoteSourceType } from '../remote-sources/index.js';

export const mergeSourceColumns = (currentSource, dataset, fallbackFields = []) => {
  const nextCount = Math.max(
    currentSource?.columns?.length || 0,
    dataset?.columns?.length || 0,
    fallbackFields.length || 0,
  );

  return Array.from({ length: nextCount }, (_item, index) => ({
    id: currentSource?.columns?.[index]?.id || dataset?.columns?.[index]?.id || `col-${index}`,
    label:
      currentSource?.columns?.[index]?.label ||
      dataset?.columns?.[index]?.label ||
      fallbackFields[index]?.label ||
      `Column ${index + 1}`,
  }));
};

export const mergeSourceRows = (currentSource, dataset) =>
  (dataset?.rows || []).map((row, index) => ({
    ...row,
    id: currentSource?.rows?.[index]?.id || row.id,
    index: index + 1,
    timer: currentSource?.rows?.[index]?.timer || row.timer,
  }));

export const fetchRemoteSourcePayload = async (api, remoteConfig) =>
  api('/api/sources/fetch-remote', {
    method: 'POST',
    body: {
      type: normalizeRemoteSourceType(remoteConfig?.type),
      url: remoteConfig?.url || '',
      sheetName: remoteConfig?.sheetName || '',
      resolvedUrlHint: remoteConfig?.lastResolvedUrl || '',
    },
  });

export const buildSourceFromRemoteFetch = ({
  currentSource = null,
  payload,
  fallbackName,
  remoteConfig,
  fallbackFields = [],
}) => {
  const dataset = parseSourceText({
    text: payload.text,
    name: fallbackName || currentSource?.name || 'Remote Source',
    templateFields: currentSource?.columns || fallbackFields,
  });

  return {
    ...(currentSource || {}),
    ...dataset,
    id: currentSource?.id || dataset.id,
    name: fallbackName || currentSource?.name || dataset.name,
    columns: mergeSourceColumns(currentSource, dataset, fallbackFields),
    rows: mergeSourceRows(currentSource, dataset),
    remote: createRemoteSourceConfig({
      ...remoteConfig,
      sheetName: payload.sheetName || remoteConfig?.sheetName || '',
      sheetNames: payload.sheetNames || [],
      lastFetchedAt: new Date().toISOString(),
      lastError: null,
      lastResolvedUrl: payload.resolvedUrl || '',
    }),
  };
};

export const getRemoteImportFallbackName = ({ remoteConfig, remoteSourceName, sourceName }) =>
  remoteSourceName || sourceName || getRemoteSourceTypeLabel(remoteConfig?.type);
