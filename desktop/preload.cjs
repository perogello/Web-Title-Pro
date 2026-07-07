const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('webTitleDesktop', {
  getProjectStatus: () => ipcRenderer.invoke('project:get-status'),
  getStartupInfo: () => ipcRenderer.invoke('app:get-startup-info'),
  getStartupProject: () => ipcRenderer.invoke('project:get-startup-project'),
  confirmUnsavedChanges: (payload) => ipcRenderer.invoke('project:confirm-unsaved', payload),
  openProjectDialog: () => ipcRenderer.invoke('project:open-dialog'),
  openRecentProject: (projectPath) => ipcRenderer.invoke('project:open-recent', projectPath),
  saveProject: (payload) => ipcRenderer.invoke('project:save', payload),
  saveProjectAs: (payload) => ipcRenderer.invoke('project:save-as', payload),
  createNewProject: () => ipcRenderer.invoke('project:new'),
  requestAppClose: () => ipcRenderer.invoke('project:request-close'),
  setWindowTitle: (payload) => ipcRenderer.invoke('window:set-title', payload),
  getWindowState: () => ipcRenderer.invoke('window:get-state'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onWindowStateChanged: (callback) => {
    const listener = (_event, payload) => callback?.(payload);
    ipcRenderer.on('window:state-changed', listener);
    return () => ipcRenderer.removeListener('window:state-changed', listener);
  },
  installAvailableUpdate: (payload) => ipcRenderer.invoke('updates:install-available', payload),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  onUpdatesState: (callback) => {
    const listener = (_event, state) => callback?.(state);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.removeListener('updates:state', listener);
  },
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
  getYandexAuthSettings: () => ipcRenderer.invoke('settings:get-yandex-auth'),
  saveYandexAuthSettings: (payload) => ipcRenderer.invoke('settings:save-yandex-auth', payload),
  disconnectYandexAuth: () => ipcRenderer.invoke('settings:disconnect-yandex-auth'),
  startYandexAuth: () => ipcRenderer.invoke('settings:start-yandex-auth'),
  getSystemFonts: (payload) => ipcRenderer.invoke('system:get-fonts', payload),
  openPath: (targetPath) => ipcRenderer.invoke('system:open-path', targetPath),
  openTemplateFolders: () => ipcRenderer.invoke('templates:open-folders'),
  pickTemplateFolder: () => ipcRenderer.invoke('templates:pick-folder'),
  syncGlobalShortcuts: (shortcutBindings) => ipcRenderer.invoke('shortcuts:sync-global', shortcutBindings),
  openRenderWindow: (payload) => ipcRenderer.invoke('render-window:open', payload),
  resetApp: () => ipcRenderer.invoke('maintenance:reset'),
  uninstallApp: () => ipcRenderer.invoke('maintenance:uninstall'),
  onGlobalShortcutFired: (callback) => {
    const listener = (_event, payload) => callback?.(payload);
    ipcRenderer.on('global-shortcut-fired', listener);
    return () => ipcRenderer.removeListener('global-shortcut-fired', listener);
  },
});
