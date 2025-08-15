class WebSocketCommunication {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000; // 3 seconds
        this.messageHandlers = new Map();

        this.connect();
        this.setupMessageHandlers();
    }

    connect() {
        try {
            this.ws = new WebSocket('ws://localhost:8080');

            this.ws.onopen = () => {
                console.log('Connected to automation app from:', window.location.href);
                this.reconnectAttempts = 0;
                this.sendMessage({
                    action: 'extensionConnected',
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    timestamp: Date.now()
                });
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('Error parsing message from app:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('Disconnected from automation app');
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Error connecting to automation app:', error);
            this.attemptReconnect();
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            setTimeout(() => {
                this.connect();
            }, this.reconnectDelay);
        } else {
            console.log('Max reconnection attempts reached');
        }
    }

    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
            return true;
        } else {
            console.log('WebSocket not connected, cannot send message');
            return false;
        }
    }

    handleMessage(data) {
        console.log('Received message from app:', data);

        if (this.messageHandlers.has(data.action)) {
            this.messageHandlers.get(data.action)(data);
        } else {
            console.log('No handler for action:', data.action);
        }
    }

    setupMessageHandlers() {
        this.messageHandlers.set('connected', (data) => {
            console.log('Connection confirmed:', data.message);
        });

        this.messageHandlers.set('configUpdate', (data) => {
            this.handleConfigUpdate(data.config);
        });

        this.messageHandlers.set('runNotification', (data) => {
            this.handleRunNotification(data);
        });

        this.messageHandlers.set('maintenanceRestarting', (data) => {
            console.log('🔄 Automation is restarting due to maintenance:', data.message);
        });

        this.messageHandlers.set('maintenanceRestartFailed', (data) => {
            console.log('❌ Automation restart failed after maintenance:', data.message);
        });
    }

    handleConfigUpdate(config) {
        console.log('Config update received:', config);
        // Update extension configuration
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({
                type: 'configUpdate',
                config: config
            });
        }
    }

    handleRunNotification(data) {
        console.log('Run notification command received:', data);
        // Send run notification message to background script
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({
                type: 'runNotification',
                message: data.message || 'Starting notifications from automation app'
            });
        }
    }

    // Public methods for the extension to use
    notifyAppOfAction(action, data) {
        this.sendMessage({
            action,
            data: data,
            timestamp: Date.now()
        });
    }
}

// Initialize communication when script loads
let wsComm = null;

// Only initialize on game pages or extension pages to avoid unnecessary connections
const currentUrl = window.location.href;
console.log('Initializing WebSocket communication for:', currentUrl);

if (currentUrl.includes('bpweb')) {
    // Initialize when DOM is ready or immediately if already loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (!window.wsComm) {  // Prevent multiple instances
                wsComm = new WebSocketCommunication();
                window.wsComm = wsComm;
                console.log('WebSocket communication initialized for:', currentUrl);
            }
        });
    } else {
        if (!window.wsComm) {  // Prevent multiple instances
            wsComm = new WebSocketCommunication();
            window.wsComm = wsComm;
            console.log('WebSocket communication initialized for:', currentUrl);
        }
    }
} else {
    console.log('WebSocket communication not initialized - not a target page:', currentUrl);
}