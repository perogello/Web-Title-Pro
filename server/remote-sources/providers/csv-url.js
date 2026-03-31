export const csvUrlRemoteSourceProvider = {
  type: 'csv-url',
  async resolveUrl(rawUrl) {
    return new URL(String(rawUrl).trim()).toString();
  },
};
