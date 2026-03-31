const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('webTitleDesktop', {
  getProjectStatus: () => ipcRenderer.invoke('project:get-status'),
  getStartupProject: () => ipcRenderer.invoke('project:get-startup-project'),
  confirmUnsavedChanges: (payload) => ipcRenderer.invoke('project:confirm-unsaved', payload),
  openProjectDialog: () => ipcRenderer.invoke('project:open-dialog'),
  openRecentProject: (projectPath) => ipcRenderer.invoke('project:open-recent', projectPath),
  saveProject: (payload) => ipcRenderer.invoke('project:save', payload),
  saveProjectAs: (payload) => ipcRenderer.invoke('project:save-as', payload),
  createNewProject: () => ipcRenderer.invoke('project:new'),
  requestAppClose: () => ipcRenderer.invoke('project:request-close'),
  setWindowTitle: (payload) => ipcRenderer.invoke('window:set-title', payload),
  getYandexAuthSettings: () => ipcRenderer.invoke('settings:get-yandex-auth'),
  saveYandexAuthSettings: (payload) => ipcRenderer.invoke('settings:save-yandex-auth', payload),
  disconnectYandexAuth: () => ipcRenderer.invoke('settings:disconnect-yandex-auth'),
  startYandexAuth: () => ipcRenderer.invoke('settings:start-yandex-auth'),
});
