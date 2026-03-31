import { csvUrlRemoteSourceProvider } from './providers/csv-url.js';
import { googleSheetsRemoteSourceProvider } from './providers/google-sheets.js';
import { yandexDiskPublicRemoteSourceProvider } from './providers/yandex-disk-public.js';
import {
  assertHttpUrl,
  bufferToUtf8Text,
  isSpreadsheetPayload,
  looksLikeHtmlText,
  readRemoteSourceBuffer,
  readWorkbookAsCsv,
} from './shared.js';

const providers = [
  csvUrlRemoteSourceProvider,
  googleSheetsRemoteSourceProvider,
  yandexDiskPublicRemoteSourceProvider,
];

const providerMap = new Map(providers.map((provider) => [provider.type, provider]));

export const REMOTE_SOURCE_TYPES = new Set(providers.map((provider) => provider.type));

export const normalizeRemoteSourceType = (value) => (providerMap.has(value) ? value : csvUrlRemoteSourceProvider.type);

export const fetchRemoteSourceData = async ({ type, url, sheetName, signal, resolvedUrlHint = '' }) => {
  const normalizedType = normalizeRemoteSourceType(type);
  const provider = providerMap.get(normalizedType);
  const sanitizedUrl = assertHttpUrl(url);
  let resolvedUrl = await provider.resolveUrl(sanitizedUrl, { signal });
  let payload;

  try {
    payload = await readRemoteSourceBuffer({
      url: resolvedUrl,
      signal,
    });
  } catch (error) {
    if (!resolvedUrlHint) {
      throw error;
    }

    const hintedUrl = assertHttpUrl(resolvedUrlHint);
    payload = await readRemoteSourceBuffer({
      url: hintedUrl,
      signal,
    });
    resolvedUrl = payload.finalUrl || hintedUrl;
  }

  const effectiveUrl = payload.finalUrl || resolvedUrl;
  const parsedPayload = isSpreadsheetPayload({
    contentType: payload.contentType,
    url: effectiveUrl,
    buffer: payload.buffer,
  })
    ? readWorkbookAsCsv({
        buffer: payload.buffer,
        requestedSheetName: sheetName,
      })
    : (() => {
        const text = bufferToUtf8Text(payload.buffer);
        if (looksLikeHtmlText(text) || String(payload.contentType || '').toLowerCase().includes('text/html')) {
          throw new Error('Remote source returned an HTML page instead of table data.');
        }
        return {
          text,
          sheetNames: [],
          sheetName: '',
        };
      })();

  return {
    type: normalizedType,
    originalUrl: url,
    resolvedUrl: effectiveUrl,
    text: parsedPayload.text,
    contentType: payload.contentType,
    sheetNames: parsedPayload.sheetNames,
    sheetName: parsedPayload.sheetName,
  };
};
