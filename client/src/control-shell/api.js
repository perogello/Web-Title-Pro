export const BACKEND_ORIGIN = window.location.port === '5173' ? 'http://localhost:4000' : window.location.origin;
export const WS_ORIGIN = BACKEND_ORIGIN.replace(/^http/, 'ws');

export const api = async (path, options = {}) => {
  const response = await fetch(`${BACKEND_ORIGIN}${path}`, {
    method: options.method || 'GET',
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body:
      options.body instanceof FormData
        ? options.body
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ error: 'Request failed' }));
    const error = new Error(errorPayload.error || 'Request failed');
    error.details = errorPayload.details || null;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

export const copyText = async (value) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {}

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};
