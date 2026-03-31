const normalizeGoogleSheetsUrl = (rawUrl) => {
  const parsed = new URL(rawUrl);
  const match = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/i);

  if (!match?.[1]) {
    return rawUrl;
  }

  const gid = parsed.searchParams.get('gid') || parsed.hash.match(/gid=(\d+)/i)?.[1] || '0';
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${encodeURIComponent(gid)}`;
};

export const googleSheetsRemoteSourceProvider = {
  type: 'google-sheets',
  async resolveUrl(rawUrl) {
    return normalizeGoogleSheetsUrl(new URL(String(rawUrl).trim()).toString());
  },
};
