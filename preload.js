const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startLogin: (username, password, proxyServer) => ipcRenderer.invoke('start-login', { username, password, proxyServer }),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    loadConfig: () => ipcRenderer.invoke('load-config')
});