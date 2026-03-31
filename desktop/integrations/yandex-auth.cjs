const http = require('node:http');

const YANDEX_OAUTH_AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
const YANDEX_OAUTH_TOKEN_URL = 'https://oauth.yandex.ru/token';
const DEFAULT_YANDEX_REDIRECT_URI = 'http://127.0.0.1:43145/yandex/callback';

const createYandexAuthIntegration = ({
  shell,
  persist,
  getState,
  setState,
  canEncryptSecrets,
}) => {
  const normalizeSecrets = (value = {}) => ({
    clientId: typeof value.clientId === 'string' ? value.clientId : '',
    clientSecret: typeof value.clientSecret === 'string' ? value.clientSecret : '',
    redirectUri: typeof value.redirectUri === 'string' && value.redirectUri ? value.redirectUri : DEFAULT_YANDEX_REDIRECT_URI,
    scope: typeof value.scope === 'string' ? value.scope : 'cloud_api:disk.read',
    accessToken: typeof value.accessToken === 'string' ? value.accessToken : '',
    refreshToken: typeof value.refreshToken === 'string' ? value.refreshToken : '',
    accountLogin: typeof value.accountLogin === 'string' ? value.accountLogin : '',
    accountName: typeof value.accountName === 'string' ? value.accountName : '',
    updatedAt: value.updatedAt || null,
  });

  const validateRedirectUri = (redirectUri) => {
    const parsed = new URL(redirectUri || DEFAULT_YANDEX_REDIRECT_URI);
    const host = String(parsed.hostname || '').toLowerCase();

    if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(host)) {
      throw new Error('Redirect URI must point to a local HTTP callback, for example http://127.0.0.1:43145/yandex/callback');
    }

    return parsed;
  };

  const waitForAuthorizationCode = async ({ redirectUri, state }) => {
    const parsedRedirect = validateRedirectUri(redirectUri);
    const expectedPath = parsedRedirect.pathname || '/';

    return new Promise((resolve, reject) => {
      const server = http.createServer((request, response) => {
        try {
          const requestUrl = new URL(request.url, `${parsedRedirect.protocol}//${parsedRedirect.host}`);

          if (requestUrl.pathname !== expectedPath) {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Not found');
            return;
          }

          const returnedState = requestUrl.searchParams.get('state') || '';
          const code = requestUrl.searchParams.get('code') || '';
          const error = requestUrl.searchParams.get('error') || '';
          const errorDescription = requestUrl.searchParams.get('error_description') || '';

          if (returnedState !== state) {
            response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            response.end('<html><body><h2>Yandex authorization failed</h2><p>State check failed.</p></body></html>');
            reject(new Error('Yandex authorization state mismatch.'));
            server.close();
            return;
          }

          if (error) {
            response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            response.end('<html><body><h2>Yandex authorization failed</h2><p>You can close this window and return to Web Title Pro.</p></body></html>');
            reject(new Error(errorDescription || error));
            server.close();
            return;
          }

          if (!code) {
            response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            response.end('<html><body><h2>Yandex authorization failed</h2><p>No authorization code was received.</p></body></html>');
            reject(new Error('No Yandex authorization code was received.'));
            server.close();
            return;
          }

          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end('<html><body><h2>Yandex connected</h2><p>You can close this window and return to Web Title Pro.</p></body></html>');
          resolve(code);
          server.close();
        } catch (error) {
          reject(error);
          server.close();
        }
      });

      server.on('error', reject);
      server.listen(Number(parsedRedirect.port || 80), parsedRedirect.hostname);

      setTimeout(() => {
        reject(new Error('Yandex authorization timed out.'));
        server.close();
      }, 5 * 60 * 1000);
    });
  };

  const exchangeAuthorizationCode = async ({ clientId, clientSecret, redirectUri, code }) => {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
    });

    if (clientSecret) {
      body.set('client_secret', clientSecret);
    }

    const response = await fetch(YANDEX_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': 'Web-Title-Pro-Yandex-OAuth',
      },
      body: body.toString(),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error_description || payload.error || 'Could not exchange Yandex authorization code for tokens.');
    }

    return payload;
  };

  const fetchUserProfile = async (accessToken) => {
    if (!accessToken) {
      return {
        accountLogin: '',
        accountName: '',
      };
    }

    const response = await fetch('https://login.yandex.ru/info?format=json', {
      headers: {
        Accept: 'application/json',
        Authorization: `OAuth ${accessToken}`,
        'User-Agent': 'Web-Title-Pro-Yandex-OAuth',
      },
    });

    if (!response.ok) {
      return {
        accountLogin: '',
        accountName: '',
      };
    }

    const payload = await response.json();
    return {
      accountLogin: typeof payload?.login === 'string' ? payload.login : '',
      accountName:
        typeof payload?.display_name === 'string' && payload.display_name
          ? payload.display_name
          : typeof payload?.real_name === 'string'
            ? payload.real_name
            : '',
    };
  };

  const getPayload = () => ({
    supported: true,
    encrypted: canEncryptSecrets(),
    ...normalizeSecrets(getState()),
  });

  const save = async (payload = {}) => {
    const currentState = normalizeSecrets(getState());
    const normalizedPayload = normalizeSecrets(payload);
    const credentialsChanged = ['clientId', 'clientSecret', 'redirectUri', 'scope'].some((key) => normalizedPayload[key] !== currentState[key]);
    const nextState = {
      ...currentState,
      ...normalizedPayload,
      accessToken: credentialsChanged ? '' : currentState.accessToken,
      refreshToken: credentialsChanged ? '' : currentState.refreshToken,
      accountLogin: credentialsChanged
        ? ''
        : normalizedPayload.accessToken
          ? normalizedPayload.accountLogin || currentState.accountLogin || ''
          : currentState.accountLogin || '',
      accountName: credentialsChanged
        ? ''
        : normalizedPayload.accessToken
          ? normalizedPayload.accountName || currentState.accountName || ''
          : currentState.accountName || '',
      updatedAt: new Date().toISOString(),
    };
    setState(nextState);
    await persist();
    return getPayload();
  };

  const disconnect = async () => {
    const currentState = normalizeSecrets(getState());
    setState({
      ...currentState,
      accessToken: '',
      refreshToken: '',
      accountLogin: '',
      accountName: '',
      updatedAt: new Date().toISOString(),
    });
    await persist();
    return getPayload();
  };

  const connect = async () => {
    const yandexAuth = normalizeSecrets(getState());

    if (!yandexAuth.clientId) {
      throw new Error('Client ID is required before Yandex authorization can start.');
    }

    const parsedRedirect = validateRedirectUri(yandexAuth.redirectUri);
    const state = Math.random().toString(36).slice(2, 12);
    const authorizeUrl = new URL(YANDEX_OAUTH_AUTHORIZE_URL);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', yandexAuth.clientId);
    authorizeUrl.searchParams.set('redirect_uri', parsedRedirect.toString());
    authorizeUrl.searchParams.set('state', state);
    if (yandexAuth.scope) {
      authorizeUrl.searchParams.set('scope', yandexAuth.scope);
    }

    const waitForCodePromise = waitForAuthorizationCode({
      redirectUri: parsedRedirect.toString(),
      state,
    });

    await shell.openExternal(authorizeUrl.toString());
    const code = await waitForCodePromise;
    const result = await exchangeAuthorizationCode({
      clientId: yandexAuth.clientId,
      clientSecret: yandexAuth.clientSecret,
      redirectUri: parsedRedirect.toString(),
      code,
    });
    const profile = await fetchUserProfile(typeof result.access_token === 'string' ? result.access_token : '');

    setState({
      ...yandexAuth,
      accessToken: typeof result.access_token === 'string' ? result.access_token : '',
      refreshToken: typeof result.refresh_token === 'string' ? result.refresh_token : '',
      accountLogin: profile.accountLogin,
      accountName: profile.accountName,
      updatedAt: new Date().toISOString(),
    });
    await persist();

    return {
      ok: true,
      ...getPayload(),
      redirectUri: parsedRedirect.toString(),
    };
  };

  return {
    normalizeSecrets,
    getPayload,
    save,
    disconnect,
    connect,
  };
};

module.exports = {
  createYandexAuthIntegration,
};
