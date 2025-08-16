const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { startAutomation, startSocketServer, sendMessageToExtension } = require('./automation');

// Handle portable executable paths
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const appPath = isDev ? __dirname : path.dirname(process.execPath);
const CONFIG_FILE = path.join(appPath, 'config.json');
const LOG_FILE = path.join(appPath, 'app.log');

let mainWindow;

// Logging utility function
function writeLog(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}${data ? ' | Data: ' + JSON.stringify(data) : ''}\n`;

    try {
        fs.appendFileSync(LOG_FILE, logEntry);
        console.log(`${level.toUpperCase()}: ${message}`, data || '');
    } catch (error) {
        console.error('Failed to write to log file:', error);
    }
}

// Log wrapper functions
const log = {
    info: (message, data) => writeLog('info', message, data),
    error: (message, data) => writeLog('error', message, data),
    warn: (message, data) => writeLog('warn', message, data),
    debug: (message, data) => writeLog('debug', message, data)
};

function createWindow() {
    log.info('Creating main window');

    mainWindow = new BrowserWindow({
        width: 600,
        height: 500,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        title: 'Auto Bot 78Win',
        resizable: true,
        minimizable: true,
        maximizable: true
    });
    const htmlPath = path.join(__dirname, 'renderer', 'index.html');
    if (fs.existsSync(htmlPath)) {
        mainWindow.loadFile(htmlPath);
        log.info('Renderer loaded successfully', { file: htmlPath });
    } else {
        log.error('Renderer file not found', { file: htmlPath });
    }
    startSocketServer();
    log.info('Socket server started');

    // Open DevTools in development
    if (isDev) {
        mainWindow.webContents.openDevTools();
        log.debug('DevTools opened in development mode');
    }

    mainWindow.on('closed', () => {
        log.info('Main window closed');
        mainWindow = null;
    });
}

function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        log.info('Configuration saved successfully');
        return true;
    } catch (error) {
        log.error('Error saving config', { error: error.message });
        return false;
    }
}

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            const config = JSON.parse(data);
            log.info('Configuration loaded successfully');
            return config;
        }
        log.warn('Config file does not exist, returning empty config');
        return {};
    } catch (error) {
        log.error('Error loading config', { error: error.message });
        return {};
    }
}

app.whenReady().then(() => {
    log.info('Electron app is ready, initializing application');
    createWindow();
});

ipcMain.handle('start-login', async (event, { username, password, proxyServer }) => {
    // Mask proxy password for logging
    let proxyLogInfo = 'disabled';
    if (proxyServer && proxyServer.trim()) {
        const proxyParts = proxyServer.trim().split(':');
        if (proxyParts.length === 4) {
            proxyLogInfo = `${proxyParts[0]}:${proxyParts[1]}:${proxyParts[2]}:****`;
        } else {
            proxyLogInfo = proxyServer;
        }
    }

    log.info('Login automation started', { username: username, proxy: proxyLogInfo });

    // Save credentials to config
    const config = loadConfig();
    config.credentials = { username, password, proxyServer };
    saveConfig(config);

    try {
        const result = await startAutomation(username, password, proxyServer);
        log.info('Login automation completed successfully', result);
        return { success: true, message: 'Login automation completed successfully', data: result };
    } catch (error) {
        log.error('Login automation failed', { error: error.message, stack: error.stack });
        return { success: false, message: 'Login automation failed', error: error.message };
    }
});

ipcMain.handle('save-config', async (event, config) => {
    log.info('Saving configuration via IPC', config);
    const existingConfig = loadConfig();
    const newConfig = { ...existingConfig, ...config };
    const result = saveConfig(newConfig);
    log.info('Configuration save result', { success: result });
    return result;
});

ipcMain.handle('load-config', async (event) => {
    log.info('Loading configuration via IPC');
    return loadConfig();
});

// Handle maintenance restart notifications
ipcMain.handle('maintenance-restart', async (event) => {
    log.warn('Maintenance restart requested from renderer');

    const config = loadConfig();
    if (!config.credentials || !config.credentials.username || !config.credentials.password) {
        log.error('No saved credentials found for restart');
        return { success: false, message: 'No saved credentials found for restart' };
    }

    try {
        // Mask proxy password for logging
        let proxyLogInfo = 'disabled';
        if (config.credentials.proxyServer && config.credentials.proxyServer.trim()) {
            const proxyParts = config.credentials.proxyServer.trim().split(':');
            if (proxyParts.length === 4) {
                proxyLogInfo = `${proxyParts[0]}:${proxyParts[1]}:${proxyParts[2]}:****`;
            } else {
                proxyLogInfo = config.credentials.proxyServer;
            }
        }

        log.info('Attempting to restart automation after maintenance', {
            username: config.credentials.username,
            proxy: proxyLogInfo
        });
        const result = await startAutomation(config.credentials.username, config.credentials.password, config.credentials.proxyServer);
        log.info('Automation restarted successfully after maintenance', result);
        return { success: true, message: 'Automation restarted successfully after maintenance', data: result };
    } catch (error) {
        log.error('Failed to restart automation after maintenance', { error: error.message, stack: error.stack });
        return { success: false, message: 'Failed to restart automation', error: error.message };
    }
});

// Handle app events
app.on('window-all-closed', () => {
    log.info('All windows closed');
    if (process.platform !== 'darwin') {
        log.info('Quitting application');
        app.quit();
    }
});

app.on('activate', () => {
    log.info('App activated');
    if (mainWindow === null) {
        createWindow();
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection', { reason: reason, promise: promise });
});

// Log app startup
log.info('Application starting up', { isDev, appPath, configFile: CONFIG_FILE, logFile: LOG_FILE });