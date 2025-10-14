let currentConfig = {};

// Load saved configuration on startup
async function loadConfig() {
  try {
    currentConfig = await window.electronAPI.loadConfig();

    // Populate form fields with saved config
    if (currentConfig.credentials) {
      document.getElementById("username").value =
        currentConfig.credentials.username || "";
      document.getElementById("password").value =
        currentConfig.credentials.password || "";
      document.getElementById("proxyServer").value =
        currentConfig.credentials.proxyServer || "";
    }

    if (currentConfig.bot) {
      document.getElementById("notificationTime").value =
        currentConfig.bot.notificationTime || 2;
      document.getElementById("chatIds").value =
        currentConfig.bot.chatIds || "";
      document.getElementById("chatFakeIds").value =
        currentConfig.bot.chatFakeIds || "";
      document.getElementById("chatReportIds").value =
        currentConfig.bot.chatReportIds || "";
    }

    updateStatus("Configuration loaded");
  } catch (error) {
    console.error("Error loading config:", error);
    updateStatus("Error loading configuration");
  }
}

function updateStatus(message) {
  document.getElementById(
    "status"
  ).textContent = `${new Date().toLocaleTimeString()}: ${message}`;
}

// Start login
document.getElementById("start").addEventListener("click", async () => {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const proxyServer = document.getElementById("proxyServer").value.trim();

  if (!username || !password) {
    updateStatus("Please enter username and password");
    return;
  }

  // Validate proxy format if provided
  if (proxyServer && proxyServer.length > 0) {
    // Support both formats: ip:port and ip:port:username:password
    const basicProxyPattern = /^.+:\d+$/;
    const authProxyPattern = /^.+:\d+:.+:.+$/;

    if (
      !basicProxyPattern.test(proxyServer) &&
      !authProxyPattern.test(proxyServer)
    ) {
      updateStatus(
        "Invalid proxy format. Use: ip:port or ip:port:username:password"
      );
      return;
    }
  }

  try {
    updateStatus("Starting login...");
    await window.electronAPI.startLogin(username, password, proxyServer);
    updateStatus("Login process started");
  } catch (error) {
    console.error("Login error:", error);
    updateStatus("Login failed");
  }
});

// Save configuration
document.getElementById("saveConfig").addEventListener("click", async () => {
  const config = {
    bot: {
      notificationTime:
        parseInt(document.getElementById("notificationTime").value) || 2,
      chatIds: document.getElementById("chatIds").value.trim(),
      chatFakeIds: document.getElementById("chatFakeIds").value.trim(),
      chatReportIds: document.getElementById("chatReportIds").value.trim(),
      money: parseInt(document.getElementById("money").value) || 500,
    },
  };

  try {
    const success = await window.electronAPI.saveConfig(config);
    if (success) {
      currentConfig = { ...currentConfig, ...config };
      updateStatus("Configuration saved successfully");
    } else {
      updateStatus("Failed to save configuration");
    }
  } catch (error) {
    console.error("Save config error:", error);
    updateStatus("Error saving configuration");
  }
});

// Scheduler functionality
let schedulerTimes = [];

// Format date for display
function formatNextRunTime(isoDateString) {
  const date = new Date(isoDateString);
  return date.toLocaleString();
}

// Format remaining time in hours and minutes
function formatRemainingTime(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

// Update the UI with scheduled times
function updateSchedulerTimesUI() {
  const container = document.getElementById("scheduledTimes");
  container.innerHTML = "";

  if (schedulerTimes.length === 0) {
    container.innerHTML = "<p>No scheduled times added yet.</p>";
    return;
  }

  // Sort times chronologically
  schedulerTimes.sort();

  schedulerTimes.forEach((time) => {
    const timeItem = document.createElement("div");
    timeItem.className = "scheduled-time-item";

    const timeText = document.createElement("span");
    timeText.className = "time-text";
    timeText.textContent = time;

    const removeButton = document.createElement("button");
    removeButton.className = "remove-time";
    removeButton.textContent = "Remove";
    removeButton.onclick = () => {
      schedulerTimes = schedulerTimes.filter((t) => t !== time);
      updateSchedulerTimesUI();
    };

    timeItem.appendChild(timeText);
    timeItem.appendChild(removeButton);
    container.appendChild(timeItem);
  });
}

// Load scheduler configuration
async function loadSchedulerConfig() {
  try {
    const status = await window.electronAPI.getSchedulerStatus();
    document.getElementById("schedulerEnabled").checked = status.enabled;
    schedulerTimes = status.times || [];
    updateSchedulerTimesUI();

    // Update next run times info
    updateNextRunInfo(status.nextRunTimes);
  } catch (error) {
    console.error("Error loading scheduler config:", error);
    updateStatus("Error loading scheduler configuration");
  }
}

// Update next run information in the UI
function updateNextRunInfo(nextRunTimes) {
  const container = document.getElementById("nextRunInfo");
  container.innerHTML = "";

  if (!nextRunTimes || nextRunTimes.length === 0) {
    container.innerHTML = "<p>No upcoming scheduled runs.</p>";
    return;
  }

  const nextRun = nextRunTimes[0]; // Get the soonest run
  const formattedTime = formatNextRunTime(nextRun.nextRun);
  const remainingTime = formatRemainingTime(nextRun.msRemaining);

  container.innerHTML = `<p><strong>Next run:</strong> ${nextRun.time} (${formattedTime})</p>
                          <p><strong>Time remaining:</strong> ${remainingTime}</p>`;
}

// Add time button handler
document.getElementById("addTime").addEventListener("click", () => {
  const timeInput = document.getElementById("newTime");
  const time = timeInput.value;

  if (!time) {
    updateStatus("Please select a time to add");
    return;
  }

  if (schedulerTimes.includes(time)) {
    updateStatus("This time is already scheduled");
    return;
  }

  schedulerTimes.push(time);
  updateSchedulerTimesUI();
  timeInput.value = "";
});

// Save scheduler button handler
document.getElementById("saveScheduler").addEventListener("click", async () => {
  const enabled = document.getElementById("schedulerEnabled").checked;

  const schedulerSettings = {
    enabled,
    times: schedulerTimes,
  };

  try {
    const result = await window.electronAPI.updateScheduler(schedulerSettings);
    if (result.success) {
      updateStatus("Scheduler settings saved successfully");
      await loadSchedulerConfig(); // Refresh with latest data from main process
    } else {
      updateStatus("Failed to save scheduler settings");
    }
  } catch (error) {
    console.error("Save scheduler error:", error);
    updateStatus("Error saving scheduler settings");
  }
});

document
  .getElementById("importScheduler")
  .addEventListener("click", async () => {
    try {
      const result = await window.electronAPI.importScheduler();
      if (result.success) {
        schedulerTimes = result.times;
        updateSchedulerTimesUI();
        updateStatus("Scheduler imported successfully");
      } else {
        updateStatus("Failed to import scheduler");
        console.error("Import scheduler error:", result.error);
      }
    } catch (error) {
      updateStatus("Error importing scheduler");
      console.error("Import scheduler error:", error);
    }
  });

// Listen for automation status updates
window.electronAPI.onAutomationStatusUpdate((data) => {
  console.log("Received automation status update:", data);

  if (data.status === "stopped" && data.reason === "singleRunCompleted") {
    updateStatus(
      `Automation stopped: One-time run completed at ${new Date(
        data.timestamp
      ).toLocaleTimeString()}`
    );
  } else {
    updateStatus(`Automation status: ${data.status} - ${data.message}`);
  }
});

// Load configuration when page loads
document.addEventListener("DOMContentLoaded", () => {
  loadConfig();
  loadSchedulerConfig();

  // Periodically refresh the next run info (every minute)
  setInterval(async () => {
    if (document.getElementById("schedulerEnabled").checked) {
      const status = await window.electronAPI.getSchedulerStatus();
      updateNextRunInfo(status.nextRunTimes);
    }
  }, 60000);
});
