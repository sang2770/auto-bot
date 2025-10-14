const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { startAutomation, startSocketServer, sendMessageToExtension } = require('./automation');

// Scheduler timer
let schedulerTimers = [];

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

// Function to calculate milliseconds until a specific time today or tomorrow
function getMillisecondsUntilTime(timeStr) {
    const now = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);

    const targetTime = new Date(now);
    targetTime.setHours(hours, minutes, 0, 0);

    // If the time is already past for today, schedule for tomorrow
    if (targetTime <= now) {
        targetTime.setDate(targetTime.getDate() + 1);
    }

    return targetTime.getTime() - now.getTime();
}

// Start the scheduler based on config
function startScheduler() {
    // Xóa mọi bộ lập lịch đang tồn tại để tránh chạy trùng lặp
    clearSchedulers();

    const config = loadConfig();
    if (!config.scheduler || !config.scheduler.enabled || !config.scheduler.times || !config.scheduler.times.length) {
        log.info('Scheduler is not enabled or no times configured');
        return;
    }

    log.info('Starting scheduler with times', { times: config.scheduler.times });

    // Thiết lập một công việc định kỳ cho mỗi mốc thời gian đã lên lịch
    config.scheduler.times.forEach(timeStr => {
        const scheduleNextRun = () => {
            const getMillisecondsUntilNext = (timeStr) => {
                const now = new Date();
                const [hours, minutes] = timeStr.split(':').map(Number);
                
                const targetTime = new Date();
                targetTime.setHours(hours, minutes, 0, 0);

                // Nếu thời gian mục tiêu của ngày hôm nay đã trôi qua, hãy đặt lịch cho ngày mai
                if (targetTime.getTime() < now.getTime()) {
                    targetTime.setDate(targetTime.getDate() + 1);
                }

                return targetTime.getTime() - now.getTime();
            };

            const msUntilTime = getMillisecondsUntilNext(timeStr);
            const hours = Math.floor(msUntilTime / (1000 * 60 * 60));
            const minutes = Math.floor((msUntilTime % (1000 * 60 * 60)) / (1000 * 60));

            log.info(`Scheduling automation for ${timeStr}, which is in ${hours} hours and ${minutes} minutes`);

            const timer = setTimeout(async () => {
                log.info(`Running scheduled automation for time: ${timeStr}`);

                // Tải cấu hình mới nhất trước khi chạy
                const currentConfig = loadConfig();
                if (!currentConfig.credentials || !currentConfig.credentials.username || !currentConfig.credentials.password) {
                    log.error('No saved credentials found for scheduled automation');
                } else {
                    try {
                        await startAutomation(
                            currentConfig.credentials.username,
                            currentConfig.credentials.password,
                            currentConfig.credentials.proxyServer
                        );
                        log.info('Scheduled automation completed successfully');
                    } catch (error) {
                        log.error('Scheduled automation failed', { error: error.message, stack: error.stack });
                    }
                }

                // Xóa timer đã hoàn thành khỏi mảng
                const index = schedulerTimers.indexOf(timer);
                if (index > -1) {
                    schedulerTimers.splice(index, 1);
                }

                // Lên lịch lại cho ngày tiếp theo nếu cấu hình vẫn còn
                const newConfig = loadConfig();
                if (newConfig.scheduler && newConfig.scheduler.enabled && newConfig.scheduler.times.includes(timeStr)) {
                    scheduleNextRun();
                } else {
                    log.info(`Automation for ${timeStr} will not be rescheduled as it has been disabled or removed.`);
                }
            }, msUntilTime);

            schedulerTimers.push(timer);
        };

        // Bắt đầu chu kỳ lập lịch
        scheduleNextRun();
    });
}

// Clear all active schedulers
function clearSchedulers() {
    if (schedulerTimers.length > 0) {
        log.info(`Clearing ${schedulerTimers.length} active schedulers`);
        schedulerTimers.forEach(timer => clearTimeout(timer));
        schedulerTimers = [];
    }
}

app.whenReady().then(() => {
    log.info('Electron app is ready, initializing application');
    createWindow();

    // Start the scheduler
    startScheduler();
    log.info('Automation scheduler started');
});

// Add IPC handler for automation-stopped event
app.whenReady().then(() => {
    // Listen for automation-stopped events
    const { ipcMain } = require('electron');
    ipcMain.on('automation-stopped', (event, data) => {
        log.info('Automation stopped', data);

        // Update the UI via IPC to show the stopped state
        if (mainWindow) {
            mainWindow.webContents.send('automation-status-update', {
                status: 'stopped',
                reason: data.reason,
                message: data.message || 'Automation stopped',
                timestamp: data.timestamp
            });
        }
    });
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

    // Restart scheduler if configuration was updated
    if (result && config.scheduler) {
        startScheduler();
        log.info('Scheduler restarted due to config update');
    }

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

// IPC handler for updating scheduler settings
ipcMain.handle('update-scheduler', async (event, schedulerSettings) => {
    log.info('Updating scheduler settings via IPC', schedulerSettings);

    const config = loadConfig();
    config.scheduler = schedulerSettings;
    const result = saveConfig(config);

    if (result) {
        // Restart scheduler with new settings
        startScheduler();
        log.info('Scheduler restarted with new settings');
    }

    return {
        success: result,
        message: result ? 'Scheduler settings updated and applied' : 'Failed to update scheduler settings'
    };
});

ipcMain.handle('import-scheduler', async (event) => {
    log.info('Importing scheduler via IPC');

    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Scheduler Times',
        filters: [{ name: 'Text Files', extensions: ['txt'] }],
        properties: ['openFile']
    });

    if (!filePaths || filePaths.length === 0) {
        log.info('No file selected for import');
        return { success: false, message: 'No file selected' };
    }

    const filePath = filePaths[0];
    log.info('Selected file for import', { filePath });

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const times = content.split(',')
            .map(t => t.trim())
            .filter(Boolean) // Remove empty entries
            .map(t => {
                const time = t.replace('h', ':');
                const parts = time.split(':');
                if (parts.length === 1) {
                    return `${parts[0]}:00`;
                }
                if (parts[1] === '') {
                    return `${parts[0]}:00`;
                }
                return time;
            })
            .filter(t => { // Validate HH:mm format
                return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(t);
            });

        if (times.length === 0) {
            log.warn('No valid times found in the imported file', { content });
            return { success: false, message: 'No valid times found in the file. Times should be in "10h" or "10h15" format.' };
        }

        log.info('Successfully parsed times from file', { times });

        const config = loadConfig();
        if (!config.scheduler) {
            config.scheduler = { enabled: false, times: [] };
        }
        config.scheduler.times = times;
        
        const result = saveConfig(config);

        if (result) {
            startScheduler();
            log.info('Scheduler restarted with imported times');
            return { success: true, message: `Imported ${times.length} times successfully.`, times: times };
        } else {
            log.error('Failed to save config after importing scheduler');
            return { success: false, message: 'Failed to save configuration after import.' };
        }

    } catch (error) {
        log.error('Error importing scheduler file', { error: error.message });
        return { success: false, message: 'Error reading or parsing the file.' };
    }
});

// IPC handler to get current scheduler status
ipcMain.handle('get-scheduler-status', async (event) => {
    const config = loadConfig();
    const scheduler = config.scheduler || { enabled: false, times: [] };

    // Calculate next run times for UI display
    const nextRunTimes = scheduler.times.map(timeStr => {
        const msUntilTime = getMillisecondsUntilTime(timeStr);
        const nextRunDate = new Date(Date.now() + msUntilTime);
        return {
            time: timeStr,
            nextRun: nextRunDate.toISOString(),
            msRemaining: msUntilTime
        };
    }).sort((a, b) => a.msRemaining - b.msRemaining);

    return {
        enabled: scheduler.enabled,
        times: scheduler.times,
        nextRunTimes: nextRunTimes
    };
});

// Handle app events
app.on('window-all-closed', () => {
    log.info('All windows closed');
    if (process.platform !== 'darwin') {
        clearSchedulers();
        log.info('Quitting application');
        app.quit();
    }
});

app.on('activate', () => {
    log.info('App activated');
    if (mainWindow === null) {
        createWindow();

        // Ensure scheduler is running when app is reactivated
        startScheduler();
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