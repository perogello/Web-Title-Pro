export const yandexDiskPublicRemoteSourceProvider = {
  type: 'yandex-disk-public',
  async resolveUrl(rawUrl, { signal } = {}) {
    const publicKey = new URL(String(rawUrl).trim()).toString();
    const endpoint =
      `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(publicKey)}`;
    const response = await fetch(endpoint, {
      signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache',
        'User-Agent': 'Web-Title-Pro-Remote-Source',
      },
    });

    if (!response.ok) {
      throw new Error(`Yandex Disk public link request failed with ${response.status}.`);
    }

    const payload = await response.json();
    if (!payload?.href) {
      throw new Error('Yandex Disk did not return a downloadable file URL.');
    }

    return payload.href;
  },
};
