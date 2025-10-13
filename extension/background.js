let popupWindowId = null;
let wsComm = null;

// Initialize WebSocket communication when extension starts
function initializeWebSocketCommunication() {
  // Inject communication script into all tabs
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('https')) && tab.url.includes('bpweb')) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['communication.js']
        }).catch((e) => {
          // Ignore injection errors for tabs that don't allow it
          console.log("Error injecting script:", e);
        });
      }
    });
  });
}

// Initialize when extension starts
chrome.tabs.onUpdated.addListener(() => {
  console.log('Extension updated...');
  initializeWebSocketCommunication();
});

// Initialize when extension is installed/enabled
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/enabled...');
  initializeWebSocketCommunication();
});

// Initialize immediately for dev/testing
setTimeout(initializeWebSocketCommunication, 1000);

chrome.action.onClicked.addListener(() => {
  chrome.windows.create(
    {
      url: "index.html",
      type: "popup",
      width: 500,
      height: 550,
      left: 100,
      top: 100,
    },
    (win) => (popupWindowId = win.id)
  );
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("BG Received message:", message);

  if (message.action === "capture_tab") {
    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      { format: "png" },
      (dataUrl) => {
        sendResponse({ image: dataUrl });
      }
    );
    return true;
  } else if (message.type === "reloadSession") {
    console.log("Reloading session...");
    reloadSession();
    console.log("Session reloaded");
  } else if (message.type === "configUpdate") {
    console.log("Config update received:", message.config);
    handleConfigUpdate(message.config);
  } else if (message.type === "runNotification") {
    console.log("Run notification received:", message.message);
    handleRunNotification();
  } else if (message.type === "maintenanceDetected") {
    console.log("Maintenance detected, notifying app");
    handleMaintenanceDetected(message);
  } else if (message.type === "stopAutomation") {
    console.log("Single run completed, stopping automation");
    handleStopAutomation(message);
  } else if (message.type === "GET_STORAGE_DATA") {
    const keys = message.keys;
    chrome.storage.local.get(keys, (data) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError });
        return;
      }
      console.log("Retrieved storage data:", data);

      sendResponse(data);
    });
    return true;
  } else if (message.type === "SET_STORAGE_DATA") {
    const data = message.data;
    chrome.storage.local.set({ [data.key]: data.value }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError });
        return;
      }
      sendResponse({ success: true });
    });
    return true;
  } else if (message.type) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, message);
      });
    });
  }
});

async function handleConfigUpdate(config) {
  console.log("Processing config update:", config);

  // Save config to storage
  await chrome.storage.local.set({ appConfig: config });

  // Send config update to all tabs
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'configUpdate',
        config: config
      });
    });
  });
}

async function handleRunNotification() {
  console.log("Processing run notification request from automation app");

  // Send run notification to all tabs (especially game tabs)
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'runNotification'
      });
    });
  });

  console.log("Run notification sent to all tabs");
}

async function handleMaintenanceDetected(message) {
  console.log("Processing maintenance detection from content script");

  // Create WebSocket connection to notify automation app
  try {
    const ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => {
      console.log("Connected to automation app for maintenance notification");

      // Send maintenance detection message
      ws.send(JSON.stringify({
        action: 'maintenanceDetected',
        message: message.message || 'Maintenance detected in extension',
        timestamp: Date.now(),
        requestRestart: true
      }));

      // Close connection after sending
      setTimeout(() => {
        ws.close();
      }, 1000);
    };

    ws.onerror = (error) => {
      console.error("Failed to notify automation app about maintenance:", error);
    };

  } catch (error) {
    console.error("Error creating WebSocket connection for maintenance notification:", error);
  }
}

async function reloadSession() {
  const tabs = await chrome.tabs.query({
    active: true,
    url: ["http://*/*", "https://*/*"], // Chỉ tìm các tab có URL là http hoặc https
  });
  const activeTab = tabs[0];
  if (!activeTab) {
    return;
  }
  const tabId = activeTab.id;
  chrome.tabs.reload(tabId);
  // // close windowPopup
  if (popupWindowId) {
    chrome.windows.remove(popupWindowId);
    popupWindowId = null;
  }
}

async function handleStopAutomation(message) {
  console.log("Processing automation stop request from content script");

  // Create WebSocket connection to notify automation app
  try {
    const ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => {
      console.log("Connected to automation app to stop automation");

      // Send stop automation message
      ws.send(JSON.stringify({
        action: 'stopAutomation',
        message: message.message || 'Automation stopped after single run',
        timestamp: Date.now(),
        reason: message.reason || 'singleRunCompleted'
      }));

      // Close connection after sending
      setTimeout(() => {
        ws.close();
      }, 1000);
    };

    ws.onerror = (error) => {
      console.error("WebSocket connection error:", error);
    };
  } catch (error) {
    console.error("Error notifying automation app about stopping:", error);
  }

  // Also update the local storage to ensure the extension knows automation is stopped
  chrome.storage.local.set({ isTrigger: false }, () => {
    console.log("Updated isTrigger to false in storage");
  });
}

console.log("Background script loaded");
