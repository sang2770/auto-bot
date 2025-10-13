const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const ProxyChain = require('proxy-chain');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

puppeteer.use(StealthPlugin());

const WebSocket = require('ws');

// Handle portable executable paths
const isDev = process.env.NODE_ENV === 'development' || (app && !app.isPackaged);
const appPath = isDev ? __dirname : path.dirname(process.execPath);
const extensionPath = isDev ? path.join(__dirname, 'extension') : path.join(process.resourcesPath, 'extension');

function sleep(s) {
    return new Promise(resolve => setTimeout(resolve, s * 1000));
}
let currentWebSocket = null;
let currentBrowser = null; // Track current browser instance
let anonymizedProxyUrl = null; // Track anonymized proxy URL
const CONFIG_FILE = path.join(appPath, 'config.json');
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

function startSocketServer() {
    const wss = new WebSocket.Server({ port: 8080 });
    console.log('WebSocket server started on ws://localhost:8080');

    wss.on('connection', (ws) => {
        console.log('Extension connected');
        currentWebSocket = ws;

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());
                console.log('From Extension:', data);
                handleExtensionMessage(data);
            } catch (error) {
                console.error('Error parsing message from extension:', error);
            }
        });

        ws.on('close', () => {
            console.log('Extension disconnected');
            currentWebSocket = null;
        });

        // Send connection confirmation
        ws.send(JSON.stringify({
            action: 'connected',
            message: 'WebSocket connection established'
        }));

        // Load initial config and send to extension
        const config = loadConfig();
        ws.send(JSON.stringify({
            action: 'configUpdate',
            config: config.bot || {},
            runOnce: config.scheduler?.runOnce || false
        }));

        // runNotification
        ws.send(JSON.stringify({
            action: 'runNotification',
            message: 'Automation app started',
            timestamp: Date.now()
        }));
    });

    return wss;
}

function handleExtensionMessage(data) {
    switch (data.action) {
        case 'configUpdate':
            console.log('Extension config updated:', data.config);
            break;
        case 'maintenanceDetected':
            console.log('🚨 Maintenance detected by extension:', data.message);
            handleMaintenanceRestart(data);
            break;
        case 'stopAutomation':
            console.log('⏹️ Stop automation requested:', data.message);
            handleStopAutomation(data);
            break;
        case 'extensionConnected':
            console.log('Extension connected from:', data.url);
            break;
        default:
            console.log('Unknown action from extension:', data.action);
    }
}

async function handleMaintenanceRestart(data) {
    console.log('🛠️ Handling maintenance restart request...');

    // Close existing browser instance if it exists
    if (currentBrowser) {
        console.log('🔄 Closing existing browser instance...');
        try {
            await closeBrowserSafely(currentBrowser);
            console.log('✅ Old browser instance closed successfully with data cleanup');
        } catch (error) {
            console.error('⚠️ Error closing old browser instance:', error);
        }
        currentBrowser = null;
    }

    // Load current config to get credentials
    const config = loadConfig();
    if (!config.credentials || !config.credentials.username || !config.credentials.password) {
        console.error('❌ Cannot restart - no saved credentials found');
        return;
    }

    // Wait a bit before restarting to ensure old browser is fully closed
    await sleep(5);

    console.log('🔄 Restarting automation due to maintenance...');
    try {
        // Start automation again with saved credentials
        await startAutomation(config.credentials.username, config.credentials.password, config.credentials.proxyServer);
        console.log('✅ Automation restarted successfully after maintenance');
    } catch (error) {
        console.error('❌ Error restarting automation after maintenance:', error);
        // Notify extension of restart failure
        sendMessageToExtension({
            action: 'maintenanceRestartFailed',
            message: 'Failed to restart automation after maintenance',
            error: error.message,
            timestamp: Date.now()
        });
    }
}

async function closeBrowserSafely(browser) {
    if (!browser) return;

    try {
        console.log('🔄 Safely closing browser with data cleanup...');
        // Close the browser
        await browser.close();

        // Close anonymized proxy if it exists
        if (anonymizedProxyUrl) {
            console.log('🔄 Closing anonymized proxy server...');
            try {
                await ProxyChain.closeAnonymizedProxy(anonymizedProxyUrl, true);
                anonymizedProxyUrl = null;
                console.log('✅ Anonymized proxy closed successfully');
            } catch (proxyError) {
                console.error('❌ Error closing anonymized proxy:', proxyError);
            }
        }

        console.log('✅ Browser closed safely with data cleanup');
    } catch (error) {
        console.error('❌ Error during safe browser closure:', error);

        // Force close if normal closure fails
        try {
            await browser.close();
        } catch (forceCloseError) {
            console.error('❌ Error force closing browser:', forceCloseError);
        }
    }
}

// Cleanup function for app exit
async function cleanupOnExit() {
    console.log('🧹 Performing cleanup before exit...');

    if (currentBrowser) {
        try {
            await closeBrowserSafely(currentBrowser);
            currentBrowser = null;
        } catch (error) {
            console.error('❌ Error during exit cleanup:', error);
        }
    }

    // Close any remaining anonymized proxies
    if (anonymizedProxyUrl) {
        try {
            console.log('🔄 Closing remaining anonymized proxy...');
            await ProxyChain.closeAnonymizedProxy(anonymizedProxyUrl, true);
            anonymizedProxyUrl = null;
            console.log('✅ Anonymized proxy closed during cleanup');
        } catch (error) {
            console.error('❌ Error closing anonymized proxy during cleanup:', error);
        }
    }

    console.log('✅ Cleanup completed');
}

// Register cleanup handlers
process.on('exit', () => {
    console.log('Process exiting...');
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT, cleaning up...');
    await cleanupOnExit();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, cleaning up...');
    await cleanupOnExit();
    process.exit(0);
});

process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    await cleanupOnExit();
    process.exit(1);
});

function sendMessageToExtension(message) {
    if (currentWebSocket && currentWebSocket.readyState === WebSocket.OPEN) {
        currentWebSocket.send(JSON.stringify(message));
        return true;
    } else {
        console.log('Extension not connected');
        return false;
    }
}

async function startAutomation(username, password, proxyServer) {
    // Close existing browser if any
    if (currentBrowser) {
        console.log('🔄 Closing existing browser before starting new automation...');
        try {
            await closeBrowserSafely(currentBrowser);
        } catch (error) {
            console.error('⚠️ Error closing existing browser:', error);
        }
        currentBrowser = null;
    }

    // Prepare launch options
    const launchOptions = {
        headless: false,
        executablePath: puppeteer.executablePath(),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--ignore-certificate-errors',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-blink-features=AutomationControlled',
            `--load-extension=${extensionPath}`,
            `--disable-extensions-except=${extensionPath}`,
        ],
        ignoreDefaultArgs: ['--disable-extensions'],
        timeout: 60000,
        userDataDir: null // Use temporary profile that gets deleted on close
    };

    // // Add proxy settings if provided
    if (proxyServer && proxyServer.trim()) {
        const proxyParts = proxyServer.trim().split(':');

        if (proxyParts.length === 2) {
            // Basic proxy: ip:port
            console.log('🌐 Using basic proxy server:', `${proxyParts[0]}:${proxyParts[1]}`);
            launchOptions.args.push(`--proxy-server=${proxyParts[0]}:${proxyParts[1]}`);
        } else if (proxyParts.length === 4) {
            // Authenticated proxy: ip:port:username:password - use proxy-chain
            const [ip, port, username, password] = proxyParts;
            console.log('🌐 Creating anonymized proxy for authenticated proxy:', `${ip}:${port} with username: ${username}`);

            try {
                // Create anonymized proxy that handles authentication
                anonymizedProxyUrl = await ProxyChain.anonymizeProxy({
                    url: `http://${username}:${password}@${ip}:${port}`,
                    port: 0 // Use random available port
                });

                console.log('✅ Anonymized proxy created:', anonymizedProxyUrl);
                launchOptions.args.push(`--proxy-server=${anonymizedProxyUrl}`);
            } catch (proxyError) {
                console.error('❌ Error creating anonymized proxy:', proxyError);
                console.log('⚠️ Falling back to basic proxy without authentication');
                launchOptions.args.push(`--proxy-server=${ip}:${port}`);
            }
        } else {
            console.warn('⚠️ Invalid proxy format, expected ip:port or ip:port:username:password');
        }
    } else {
        console.log('🌐 No proxy server configured');
    }

    const browser = await puppeteer.launch(launchOptions);

    // Store browser instance globally for cleanup
    currentBrowser = browser;
    console.log('🌐 New browser instance created and stored');

    const page = await browser.newPage();

    try {
        await sleep(10);
        try {
            await page.goto('https://www.78winc3.net/', { waitUntil: 'domcontentloaded' });
        } catch (navError) {
            console.error('❌ Initial navigation failed, retrying...', navError);
        }
        await sleep(20);
        // close modal if exists
        const modalSelector = '.ad-center .close';
        const modal = await page.$(modalSelector);
        if (modal) {
            await modal.click();
        }

        // Bấm login button
        await page.click('.header-btn.login');

        // Nhập thông tin
        await page.type('#login', username, { delay: 50 });
        await sleep(5);
        await page.type('#password', password, { delay: 50 });


        // class nrc-form nrc-form-block has text "Đăng nhập"
        const loginButtonSelector = '.nrc-form.nrc-form-block button';
        await page.waitForSelector(loginButtonSelector);
        await page.click(loginButtonSelector);
        // wait button logout
        await page.waitForSelector('.header-btn.logout', { timeout: 100000 });
        // redirect to game page
        await page.goto('https://www.78winc3.net/gamelobby/live', { waitUntil: 'domcontentloaded' });
        await sleep(20);
        // click data-subprovider="SEXYBCRT" with js
        await page.evaluate(async () => {
            let button = document.querySelector('[data-subprovider="SEXYBCRT"] button');
            console.log('Button found:', button);
            if (button) {
                button.click();
            } else {
                let buttonSexy = document.querySelector('li.sexybcrt');
                if (buttonSexy) {
                    buttonSexy.click();
                }

                // đợi 5s
                await new Promise(resolve => setTimeout(resolve, 5000));

                const play = document.querySelector('.sexybcrt.active .main-btn');
                console.log('Play button found:', play);
                if (play) {
                    play.click();
                } else {
                    console.log('Play button not found after delay');
                }
            }
        });

        // Wait a bit for the game to load
        await sleep(6);
        return { success: true, message: 'Login automation completed and notification started' };

    } catch (error) {
        console.error('❌ Error during automation process:', error);

        // If automation fails, clean up the browser instance
        if (currentBrowser) {
            try {
                await closeBrowserSafely(currentBrowser);
            } catch (closeError) {
                console.error('⚠️ Error closing browser after automation failure:', closeError);
            }
            currentBrowser = null;
        }

        throw error; // Re-throw the error for the caller to handle
    }
}

async function handleStopAutomation(data) {
    console.log('⏹️ Handling automation stop request:', data);

    // Close existing browser instance if it exists
    if (currentBrowser) {
        console.log('🔄 Closing existing browser instance...');
        try {
            await closeBrowserSafely(currentBrowser);
            console.log('✅ Browser instance closed successfully');
        } catch (error) {
            console.error('❌ Error closing browser:', error);
        }
        currentBrowser = null;
    }

    // Clean up proxy if needed
    if (anonymizedProxyUrl) {
        try {
            await ProxyChain.closeAnonymizedProxy(anonymizedProxyUrl, true);
            console.log('✅ Anonymized proxy closed');
        } catch (error) {
            console.error('❌ Error closing proxy:', error);
        }
        anonymizedProxyUrl = null;
    }

    // Notify the main app if we need to
    const { app, BrowserWindow } = require('electron');
    if (app && BrowserWindow) {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            windows[0].webContents.send('automation-stopped', {
                reason: data.reason || 'singleRunCompleted',
                timestamp: Date.now(),
                message: 'Automation stopped after single run completion'
            });
        }
    }

    console.log('✅ Automation stopped successfully');
}

module.exports = { startAutomation, startSocketServer, sendMessageToExtension };
