import { useEffect, useState } from 'react';

export default function YandexSettingsTab({
  yandexAuthState,
  yandexDeviceAuth,
  onSave,
  onReload,
  onConnect,
  onDisconnect,
}) {
  const supported = Boolean(yandexAuthState?.supported);
  const connected = Boolean(yandexAuthState?.accessToken);
  const accountLabel = yandexAuthState?.accountName || yandexAuthState?.accountLogin || 'Connected account';
  const hasSavedCredentials = Boolean(yandexAuthState?.clientId || yandexAuthState?.clientSecret);
  const [isEditingCredentials, setIsEditingCredentials] = useState(() => !hasSavedCredentials);
  const [draftCredentials, setDraftCredentials] = useState({
    clientId: yandexAuthState?.clientId || '',
    clientSecret: yandexAuthState?.clientSecret || '',
    scope: yandexAuthState?.scope || 'cloud_api:disk.read',
  });

  useEffect(() => {
    if (!hasSavedCredentials) {
      setIsEditingCredentials(true);
    }
  }, [hasSavedCredentials]);

  useEffect(() => {
    setDraftCredentials({
      clientId: yandexAuthState?.clientId || '',
      clientSecret: yandexAuthState?.clientSecret || '',
      scope: yandexAuthState?.scope || 'cloud_api:disk.read',
    });
  }, [
    yandexAuthState?.clientId,
    yandexAuthState?.clientSecret,
    yandexAuthState?.scope,
  ]);

  const preventSensitiveClipboard = (event) => {
    event.preventDefault();
  };

  const sensitiveInputProps = {
    autoComplete: 'off',
    spellCheck: false,
    autoCapitalize: 'off',
    autoCorrect: 'off',
    onCopy: preventSensitiveClipboard,
    onCut: preventSensitiveClipboard,
    onContextMenu: preventSensitiveClipboard,
  };

  const handleSaveCredentials = async () => {
    const payload = await onSave(draftCredentials);
    if (payload) {
      setIsEditingCredentials(false);
    }
  };

  const handleCancelEditing = () => {
    setDraftCredentials({
      clientId: yandexAuthState?.clientId || '',
      clientSecret: yandexAuthState?.clientSecret || '',
      scope: yandexAuthState?.scope || 'cloud_api:disk.read',
    });
    setIsEditingCredentials(false);
  };

  const handleDraftChange = (field, value) => {
    setDraftCredentials((current) => ({
      ...current,
      [field]: value,
    }));
  };

  return (
    <div className="integration-grid">
      <div className="info-card-v3">
        <span className="info-label-v3">Yandex OAuth</span>
        <strong>{supported ? 'Desktop-only local credentials' : 'Unavailable in browser mode'}</strong>
        <span className="note-v3">
          These values are stored locally on this computer only. They are not written into the project file and are not included in GitHub releases.
        </span>
      </div>
      <div className="output-settings-card">
        <div className="panel-head-v3 output-settings-head">
          <div>
            <span className="kicker-v3">Connect</span>
            <h3>Yandex authorization</h3>
          </div>
        </div>
        <div className="topbar-actions">
          {connected ? (
            <>
              <div className="yandex-account-chip" title={accountLabel}>
                <span className="yandex-auth-button__mark">Y</span>
                <span>{accountLabel}</span>
              </div>
              <button className="btn-v3-ghost btn-v3-sm" onClick={onDisconnect} disabled={!supported}>
                Sign out
              </button>
            </>
          ) : (
            <button className="yandex-auth-button" onClick={onConnect} disabled={!supported || !yandexAuthState?.clientId}>
              <span className="yandex-auth-button__mark">Y</span>
              <span>Sign in with Yandex ID</span>
            </button>
          )}
        </div>
        <div className="integration-grid">
          <div className="info-card-v3">
            <span className="info-label-v3">Status</span>
            <strong>
              {yandexDeviceAuth?.status === 'waiting'
                ? 'Waiting for browser callback'
                : yandexDeviceAuth?.status === 'success'
                  ? 'Connected'
                  : yandexDeviceAuth?.status === 'error'
                    ? 'Connection failed'
                    : yandexAuthState?.accessToken
                      ? 'Token saved'
                      : 'Not connected'}
            </strong>
            <span className="note-v3">
              {yandexDeviceAuth?.status === 'waiting'
                ? 'The Yandex authorization page is open in your browser. Complete login there and return will happen through your redirect URI.'
                : 'Use Sign in with Yandex ID to receive access and refresh tokens automatically.'}
            </span>
            {connected && <span className="note-v3">Connected as {accountLabel}</span>}
            {connected && <span className="note-v3">Sign out clears local tokens from Web Title Pro, but does not log you out of Yandex in the browser.</span>}
            {yandexDeviceAuth?.error && <span className="danger-note">{yandexDeviceAuth.error}</span>}
          </div>
        </div>
      </div>
      <div className="output-settings-card">
        <div className="panel-head-v3 output-settings-head">
          <div>
            <span className="kicker-v3">Application</span>
            <h3>Yandex application settings</h3>
          </div>
          <div className="topbar-actions">
            <button className="btn-v3-ghost btn-v3-sm" onClick={onReload} disabled={!supported}>Reload</button>
            {hasSavedCredentials && !isEditingCredentials && (
              <button className="btn-v3-ghost btn-v3-sm" onClick={() => setIsEditingCredentials(true)} disabled={!supported}>
                Edit credentials
              </button>
            )}
            {isEditingCredentials && hasSavedCredentials && (
              <button className="btn-v3-ghost btn-v3-sm" onClick={handleCancelEditing} disabled={!supported}>
                Cancel
              </button>
            )}
            {isEditingCredentials && (
              <button className="btn-v3-primary btn-v3-sm" onClick={handleSaveCredentials} disabled={!supported}>
                Save
              </button>
            )}
          </div>
        </div>
        <div className="info-card-v3">
          <span className="info-label-v3">Tokens</span>
          <strong>Access and refresh tokens are hidden</strong>
          <span className="note-v3">
            Web Title Pro stores them locally after successful authorization. To rotate them, use `Sign out` and then sign in again.
          </span>
        </div>
        {isEditingCredentials ? (
          <div className="output-settings-fields yandex-auth-grid">
            <label className="field-v3 field-v3-compact">
              <span>Client ID</span>
              <input
                type="password"
                value={draftCredentials.clientId}
                onChange={(event) => handleDraftChange('clientId', event.target.value)}
                placeholder="Yandex OAuth Client ID"
                disabled={!supported}
                {...sensitiveInputProps}
              />
            </label>
            <label className="field-v3 field-v3-compact">
              <span>Client Secret</span>
              <input
                type="password"
                value={draftCredentials.clientSecret}
                onChange={(event) => handleDraftChange('clientSecret', event.target.value)}
                placeholder="Yandex OAuth Client Secret"
                disabled={!supported}
                {...sensitiveInputProps}
              />
            </label>
            <label className="field-v3 field-v3-compact">
              <span>Scope</span>
              <input
                value={draftCredentials.scope}
                onChange={(event) => handleDraftChange('scope', event.target.value)}
                placeholder="cloud_api:disk.read"
                disabled={!supported}
              />
            </label>
          </div>
        ) : (
          <div className="integration-grid">
            <div className="info-card-v3">
              <span className="info-label-v3">Credentials</span>
              <strong>Client ID and Client Secret are hidden after saving</strong>
              <span className="note-v3">
                They cannot be copied back out of the UI. To replace them, use `Edit credentials`, then save and sign in again.
              </span>
            </div>
            <div className="info-card-v3">
              <span className="info-label-v3">Saved values</span>
              <strong>{hasSavedCredentials ? 'Credentials are stored locally on this computer' : 'Credentials are not saved yet'}</strong>
              <span className="note-v3">
                Scope: {yandexAuthState?.scope || 'cloud_api:disk.read'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
