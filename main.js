const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { startAutomation, startSocketServer, sendMessageToExtension } = require('./automation');

// Handle portable executable paths
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const appPath = isDev ? __dirname : path.dirname(process.execPath);
const CONFIG_FILE = path.join(appPath, 'config.json');

function createWindow() {
    const win = new BrowserWindow({
        width: 600,
        height: 500,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        icon: path.join(__dirname, 'assets', 'icon.svg'),
        title: 'Auto Bot 78Win',
        resizable: true,
        minimizable: true,
        maximizable: true
    });

    win.loadFile('renderer/index.html');
    startSocketServer();

    // Open DevTools in development
    if (isDev) {
        win.webContents.openDevTools();
    }
}

function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving config:', error);
        return false;
    }
}

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(data);
        }
        return {};
    } catch (error) {
        console.error('Error loading config:', error);
        return {};
    }
}

app.whenReady().then(createWindow);

ipcMain.handle('start-login', async (event, { username, password }) => {
    // Save credentials to config
    const config = loadConfig();
    config.credentials = { username, password };
    saveConfig(config);

    try {
        const result = await startAutomation(username, password);
        return { success: true, message: 'Login automation completed successfully', data: result };
    } catch (error) {
        console.error('Login automation failed:', error);
        return { success: false, message: 'Login automation failed', error: error.message };
    }
});

ipcMain.handle('save-config', async (event, config) => {
    const existingConfig = loadConfig();
    const newConfig = { ...existingConfig, ...config };
    return saveConfig(newConfig);
});

ipcMain.handle('load-config', async (event) => {
    return loadConfig();
});

// Handle maintenance restart notifications
ipcMain.handle('maintenance-restart', async (event) => {
    console.log('🚨 Maintenance restart requested from renderer');

    const config = loadConfig();
    if (!config.credentials || !config.credentials.username || !config.credentials.password) {
        return { success: false, message: 'No saved credentials found for restart' };
    }

    try {
        const result = await startAutomation(config.credentials.username, config.credentials.password);
        return { success: true, message: 'Automation restarted successfully after maintenance', data: result };
    } catch (error) {
        console.error('Failed to restart automation after maintenance:', error);
        return { success: false, message: 'Failed to restart automation', error: error.message };
    }
});