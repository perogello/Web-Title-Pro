import * as XLSX from 'xlsx';

export const MAX_REMOTE_SOURCE_BYTES = 5 * 1024 * 1024;

export const assertHttpUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Remote source URL is required.');
  }

  const parsed = new URL(rawUrl.trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Remote source URL must use HTTP or HTTPS.');
  }

  return parsed.toString();
};

export const readRemoteSourceBuffer = async ({ url, signal }) => {
  const response = await fetch(url, {
    signal,
    cache: 'no-store',
    headers: {
      Accept: '*/*',
      'Cache-Control': 'no-cache, no-store, max-age=0',
      Pragma: 'no-cache',
      'User-Agent': 'Web-Title-Pro-Remote-Source',
    },
  });

  if (!response.ok) {
    throw new Error(`Remote source request failed with ${response.status}.`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_REMOTE_SOURCE_BYTES) {
    throw new Error('Remote source is too large.');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    buffer,
    contentType: response.headers.get('content-type') || '',
    finalUrl: response.url || url,
  };
};

export const looksLikeSpreadsheetBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return false;
  }

  const isZipContainer = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isLegacyXls = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;

  return isZipContainer || isLegacyXls;
};

export const isSpreadsheetPayload = ({ contentType, url, buffer }) => {
  const lowerType = String(contentType || '').toLowerCase();
  const lowerUrl = String(url || '').toLowerCase();

  return (
    lowerType.includes('spreadsheetml') ||
    lowerType.includes('application/vnd.ms-excel') ||
    (lowerType.includes('application/octet-stream') && looksLikeSpreadsheetBuffer(buffer)) ||
    lowerUrl.endsWith('.xlsx') ||
    lowerUrl.endsWith('.xls') ||
    looksLikeSpreadsheetBuffer(buffer)
  );
};

export const bufferToUtf8Text = (buffer) => buffer.toString('utf8').replace(/^\uFEFF/, '');

export const looksLikeHtmlText = (text) => {
  const normalized = String(text || '').trimStart().toLowerCase();
  return normalized.startsWith('<!doctype html') || normalized.startsWith('<html') || normalized.startsWith('<?xml');
};

export const readWorkbookAsCsv = ({ buffer, requestedSheetName }) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = Array.isArray(workbook.SheetNames) ? workbook.SheetNames.filter(Boolean) : [];

  if (!sheetNames.length) {
    throw new Error('Spreadsheet does not contain any sheets.');
  }

  const resolvedSheetName = sheetNames.includes(requestedSheetName) ? requestedSheetName : sheetNames[0];
  const worksheet = workbook.Sheets[resolvedSheetName];

  if (!worksheet) {
    throw new Error('Selected sheet was not found in the spreadsheet.');
  }

  return {
    text: XLSX.utils.sheet_to_csv(worksheet, { blankrows: false }),
    sheetNames,
    sheetName: resolvedSheetName,
  };
};
