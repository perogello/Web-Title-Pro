// In-app message boxes for the main process.
//
// dialog.showMessageBox() pops a plain Windows dialog that looks nothing like
// the app. When the control window is up we render the same dialog inside it
// instead (window.__webTitleShowDialog, see client/src/control-shell/app-dialog.jsx)
// and wait for the button index; only if the renderer can't (window gone,
// page not loaded yet, splash phase) do we fall back to the native dialog.
//
// The returned object mimics `dialog`'s showMessageBox shape ({ response }) so
// existing call sites (and the auto-updater integration) can use it as-is.

// destructiveId is ours (red button); the native fallback just ignores it.
const DIALOG_FIELDS = ['type', 'title', 'message', 'detail', 'buttons', 'defaultId', 'cancelId', 'destructiveId'];

const pickDialogOptions = (options = {}) =>
  Object.fromEntries(DIALOG_FIELDS.filter((key) => options[key] !== undefined).map((key) => [key, options[key]]));

const createAppDialog = ({ dialog, log = () => {} }) => {
  const showMessageBox = async (window, options = {}) => {
    const target = window && !window.isDestroyed?.() ? window : null;

    if (target && !target.webContents?.isLoading?.()) {
      try {
        const payload = JSON.stringify(pickDialogOptions(options));
        const response = await target.webContents.executeJavaScript(
          `window.__webTitleShowDialog ? window.__webTitleShowDialog(${payload}) : null;`,
          true,
        );
        if (Number.isInteger(response)) {
          return { response, checkboxChecked: false };
        }
      } catch (error) {
        log(`app-dialog: in-app dialog failed, falling back to native (${error?.message || error})`);
      }
    }

    return target ? dialog.showMessageBox(target, options) : dialog.showMessageBox(options);
  };

  return { showMessageBox };
};

module.exports = { createAppDialog, pickDialogOptions };
