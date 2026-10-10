import { useEffect, useRef, useState } from 'react';

// App-styled replacement for native message boxes (window.confirm/alert and
// Electron's dialog.showMessageBox). One host renders a queue of dialogs; any
// module calls showAppDialog(). The main process reaches the same queue via
// window.__webTitleShowDialog (desktop/integrations/app-dialog.cjs), so the
// unsaved-project, update and maintenance prompts look like the app.
//
// Options mirror showMessageBox: { type, title, message, detail, buttons,
// defaultId, cancelId } and the promise resolves to the clicked button index
// (Escape / backdrop resolve to cancelId).

let queue = [];
let notify = () => {};

const normalize = (options = {}) => {
  const buttons = Array.isArray(options.buttons) && options.buttons.length ? options.buttons.map(String) : ['OK'];
  const clamp = (value, fallback) => (Number.isInteger(value) && value >= 0 && value < buttons.length ? value : fallback);
  return {
    type: options.type || 'info',
    title: options.title || '',
    message: options.message || '',
    detail: options.detail || '',
    buttons,
    defaultId: clamp(options.defaultId, 0),
    cancelId: clamp(options.cancelId, buttons.length - 1),
    destructiveId: clamp(options.destructiveId, -1),
  };
};

// Keyboard/mouse shortcuts are suspended while a dialog is open, so Enter or
// Space on a dialog button can never also fire an on-air shortcut.
export const isAppDialogOpen = () => queue.length > 0;

export const showAppDialog = (options) =>
  new Promise((resolve) => {
    queue = [...queue, { ...normalize(options), resolve, id: Math.random().toString(36).slice(2) }];
    notify();
  });

// Convenience yes/no wrapper for the old window.confirm call sites.
export const confirmAppDialog = async ({
  title = 'Confirm',
  message,
  detail,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  destructive = false,
}) => {
  const response = await showAppDialog({
    type: destructive ? 'warning' : 'question',
    title,
    message,
    detail,
    buttons: [confirmLabel, cancelLabel],
    defaultId: destructive ? 1 : 0,
    cancelId: 1,
    destructiveId: destructive ? 0 : -1,
  });
  return response === 0;
};

export const alertAppDialog = ({ title = 'Web Title Pro', message, detail, type = 'info' }) =>
  showAppDialog({ type, title, message, detail, buttons: ['OK'], defaultId: 0, cancelId: 0 });

const TYPE_ICON = { warning: '!', error: '×', question: '?', info: 'i' };

export default function AppDialogHost() {
  const [items, setItems] = useState(queue);
  const defaultButtonRef = useRef(null);
  const current = items[0] || null;

  useEffect(() => {
    notify = () => setItems(queue);
    window.__webTitleShowDialog = (options) => showAppDialog(options);
    return () => {
      notify = () => {};
      delete window.__webTitleShowDialog;
    };
  }, []);

  const close = (index) => {
    if (!current) return;
    queue = queue.filter((item) => item.id !== current.id);
    notify();
    current.resolve(index);
  };

  useEffect(() => {
    if (!current) return undefined;
    defaultButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(current.cancelId);
      }
    };
    // Capture + stopPropagation so global/file shortcuts don't fire under a dialog.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  if (!current) return null;

  return (
    <div
      className="modal-backdrop app-dialog-backdrop-v2"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close(current.cancelId);
      }}
    >
      <div
        className={`modal-card app-dialog-v2 is-${current.type}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`app-dialog-message-${current.id}`}
      >
        <div className="app-dialog-head-v2">
          <span className="app-dialog-icon-v2" aria-hidden>{TYPE_ICON[current.type] || TYPE_ICON.info}</span>
          <span className="app-dialog-title-v2">{current.title || 'Web Title Pro'}</span>
        </div>
        <div className="app-dialog-body-v2">
          <strong id={`app-dialog-message-${current.id}`}>{current.message}</strong>
          {current.detail && <p>{current.detail}</p>}
        </div>
        <div className="app-dialog-actions-v2">
          {current.buttons.map((label, index) => (
            <button
              key={`${current.id}-${index}`}
              ref={index === current.defaultId ? defaultButtonRef : null}
              type="button"
              className={[
                'app-dialog-btn-v2',
                index === current.defaultId ? 'is-default' : '',
                index === current.destructiveId ? 'is-danger' : '',
              ].join(' ')}
              onClick={() => close(index)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
