const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lexiconDesktop', {
  getUpdate: () => ipcRenderer.invoke('lexicon:update'),
  openUpdate: () => ipcRenderer.invoke('lexicon:open-update'),
  chooseFolder: () => ipcRenderer.invoke('lexicon:choose-folder'),
  onUpdate: (callback) => {
    const listener = (_event, notice) => callback(notice);
    ipcRenderer.on('lexicon:update-available', listener);
    return () => ipcRenderer.removeListener('lexicon:update-available', listener);
  },
});
