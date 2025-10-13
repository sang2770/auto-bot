const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startLogin: (username, password, proxyServer) => ipcRenderer.invoke('start-login', { username, password, proxyServer }),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    loadConfig: () => ipcRenderer.invoke('load-config'),
    // New scheduler APIs
    updateScheduler: (schedulerSettings) => ipcRenderer.invoke('update-scheduler', schedulerSettings),
    getSchedulerStatus: () => ipcRenderer.invoke('get-scheduler-status'),
    // Automation status notifications
    onAutomationStatusUpdate: (callback) => ipcRenderer.on('automation-status-update', (_, data) => callback(data))
});