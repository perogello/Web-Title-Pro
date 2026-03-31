import { csvUrlRemoteSourceProvider } from './providers/csv-url.js';
import { googleSheetsRemoteSourceProvider } from './providers/google-sheets.js';
import { yandexDiskPublicRemoteSourceProvider } from './providers/yandex-disk-public.js';

const providers = [
  csvUrlRemoteSourceProvider,
  googleSheetsRemoteSourceProvider,
  yandexDiskPublicRemoteSourceProvider,
];

const providerMap = new Map(providers.map((provider) => [provider.type, provider]));

export const REMOTE_SOURCE_PROVIDERS = providers;
export const REMOTE_SOURCE_TYPES = new Set(providers.map((provider) => provider.type));
export const REMOTE_SOURCE_TYPE_OPTIONS = providers.map((provider) => ({
  value: provider.type,
  label: provider.label,
}));

export const isRemoteSourceType = (value) => providerMap.has(value);

export const normalizeRemoteSourceType = (value) => (providerMap.has(value) ? value : csvUrlRemoteSourceProvider.type);

export const getRemoteSourceTypeLabel = (type) =>
  providerMap.get(type)?.label || 'Remote Source';

export const getRemoteSourceHelp = (type) =>
  providerMap.get(type)?.help || csvUrlRemoteSourceProvider.help;
