let currentConfig = {};

// Load saved configuration on startup
async function loadConfig() {
    try {
        currentConfig = await window.electronAPI.loadConfig();

        // Populate form fields with saved config
        if (currentConfig.credentials) {
            document.getElementById('username').value = currentConfig.credentials.username || '';
            document.getElementById('password').value = currentConfig.credentials.password || '';
            document.getElementById('proxyServer').value = currentConfig.credentials.proxyServer || '';
        }

        if (currentConfig.bot) {
            document.getElementById('notificationTime').value = currentConfig.bot.notificationTime || 2;
            document.getElementById('chatIds').value = currentConfig.bot.chatIds || '';
            document.getElementById('chatFakeIds').value = currentConfig.bot.chatFakeIds || '';
            document.getElementById('chatReportIds').value = currentConfig.bot.chatReportIds || '';
        }

        updateStatus('Configuration loaded');
    } catch (error) {
        console.error('Error loading config:', error);
        updateStatus('Error loading configuration');
    }
}

function updateStatus(message) {
    document.getElementById('status').textContent = `${new Date().toLocaleTimeString()}: ${message}`;
}

// Start login
document.getElementById('start').addEventListener('click', async () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const proxyServer = document.getElementById('proxyServer').value.trim();

    if (!username || !password) {
        updateStatus('Please enter username and password');
        return;
    }

    // Validate proxy format if provided
    if (proxyServer && proxyServer.length > 0) {
        // Support both formats: ip:port and ip:port:username:password
        const basicProxyPattern = /^.+:\d+$/;
        const authProxyPattern = /^.+:\d+:.+:.+$/;

        if (!basicProxyPattern.test(proxyServer) && !authProxyPattern.test(proxyServer)) {
            updateStatus('Invalid proxy format. Use: ip:port or ip:port:username:password');
            return;
        }
    }

    try {
        updateStatus('Starting login...');
        await window.electronAPI.startLogin(username, password, proxyServer);
        updateStatus('Login process started');
    } catch (error) {
        console.error('Login error:', error);
        updateStatus('Login failed');
    }
});

// Save configuration
document.getElementById('saveConfig').addEventListener('click', async () => {
    const config = {
        bot: {
            notificationTime: parseInt(document.getElementById('notificationTime').value) || 2,
            chatIds: document.getElementById('chatIds').value.trim(),
            chatFakeIds: document.getElementById('chatFakeIds').value.trim(),
            chatReportIds: document.getElementById('chatReportIds').value.trim(),
            money: parseInt(document.getElementById('money').value) || 500
        }
    };

    try {
        const success = await window.electronAPI.saveConfig(config);
        if (success) {
            currentConfig = { ...currentConfig, ...config };
            updateStatus('Configuration saved successfully');
        } else {
            updateStatus('Failed to save configuration');
        }
    } catch (error) {
        console.error('Save config error:', error);
        updateStatus('Error saving configuration');
    }
});

// Load configuration when page loads
document.addEventListener('DOMContentLoaded', loadConfig);
