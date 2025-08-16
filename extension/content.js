let username = "";
let balance = 0;
let coverImageBase64 = "";
let money = 0;
let videoOn = false;
let hideCenter = false;
let isMobile = false;
let chipCustom;
let betType; // PLAYER | TIE | BANKER
let notificationTime = 2; // Default to 2 minutes
let runTimeout = null;
let isProcessing = false;
let maintenanceObserver = null;
let messageIds = [];
const bot = new BotManager();

// Maintenance detection function
let maintenanceCheckInterval = null;

function startMaintenanceMonitoring() {
  if (maintenanceCheckInterval) {
    clearInterval(maintenanceCheckInterval);
  }

  maintenanceCheckInterval = setInterval(() => {
    const maintenanceLogout = document.querySelector('.maintenance.logout');
    if (maintenanceLogout) {
      console.log('🚨 Maintenance detected! Stopping current process and restarting...');
      handleMaintenanceDetected();
    }
  }, 500); // check mỗi 0.5 giây

  console.log('🔍 Maintenance monitoring started (interval mode)');
}

// Handle maintenance detection
async function handleMaintenanceDetected() {
  console.log('🛠️ Maintenance mode detected, initiating restart sequence...');

  // Stop current processing
  isProcessing = false;

  // Clear any running timeouts
  if (runTimeout) {
    clearTimeout(runTimeout);
    runTimeout = null;
  }

  // Stop maintenance monitoring
  if (maintenanceObserver) {
    maintenanceObserver.disconnect();
    maintenanceObserver = null;
  }

  // recall message
  if (messageIds) {
    messageIds.forEach(message => {
      if (bot) {
        bot.recallMessage(message.chatId, message.messageId);
      }
    });
  }

  // Notify the automation app about maintenance
  if (window.wsComm) {
    window.wsComm.notifyAppOfAction('maintenanceDetected', {
      url: window.location.href,
      timestamp: Date.now(),
      message: 'Maintenance page detected, requesting restart'
    });
  } else {
    // Send message to background script to notify main app
    chrome.runtime.sendMessage({
      type: 'maintenanceDetected',
      message: 'Maintenance detected, requesting automation restart'
    });
  }



  console.log('🔄 Maintenance restart sequence initiated');
}
function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function getStorageData(keys) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "GET_STORAGE_DATA", keys: keys },
      (response) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        if (response.error) {
          return reject(new Error(response.error));
        }
        resolve(response);
      }
    );
  });
}
function setStorageData(key, value) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "SET_STORAGE_DATA", data: { key, value } },
      (response) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        if (response.error) {
          return reject(new Error(response.error));
        }
        resolve(response.data);
      }
    );
  });
}

// BOT MANAGER
console.log("Content script loaded");

// Add config update handler function
async function handleConfigUpdate(config) {
  console.log("Content script handling config update:", config);

  if (config.notificationTime) {
    notificationTime = config.notificationTime;
  }

  // Update bot configuration
  if (config.chatIds || config.chatFakeIds || config.chatReportIds) {
    const parseIds = (str) => {
      if (typeof str === 'string') {
        return str.split(',').map(id => id.trim()).filter(id => id).map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      }
      return Array.isArray(str) ? str : [];
    };
    const chatIds = parseIds(config.chatIds);
    const chatFakeIds = parseIds(config.chatFakeIds);
    const chatReportIds = parseIds(config.chatReportIds);

    chrome.storage.local.set({ chatIds, chatFakeIds, chatReportIds });

    bot.updateChatIds(
      chatIds,
      chatFakeIds,
      chatReportIds
    );
  }
}

getStorageData("isTrigger").then(async (value) => {
  if (value.isTrigger) {
    await joinRoom();
  }
});

Object.defineProperty(document, "hidden", { value: false });
Object.defineProperty(document, "visibilityState", { value: "visible" });

document.addEventListener(
  "visibilitychange",
  (e) => {
    e.stopImmediatePropagation();
  },
  true
);

window.addEventListener(
  "blur",
  (e) => {
    e.stopImmediatePropagation();
  },
  true
);

window.addEventListener(
  "focus",
  (e) => {
    e.stopImmediatePropagation();
  },
  true
);

setInterval(() => {
  document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
  document.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, key: "Shift" })
  );
}, 60 * 1000);


chrome.runtime.onMessage.addListener(async (message) => {
  console.log("Received message:", message);
  if (message.type === "configUpdate") {
    handleConfigUpdate(message.config);
  }

  if (message.type === "toggleCenter") {
    hideCenter = !hideCenter;
    updateImageMainCenter();
    updateVideoMainCenter();
  }

  if (message.type === "imageCover") {
    coverImageBase64 = message.text;
    updateImageMainCenter();
  }

  if (message.type === "videoCover") {
    videoOn = message.text;
    updateVideoMainCenter();
  }

  if (message.type === "username") {
    updateUsername(message.text);
  }

  if (message.type === "balance") {
    updateBalance(message.text);
  }

  if (message.type === "isMobile") {
    isMobile = message.text;
  }

  if (message.type === "chip") {
    handleChip(message.text, message.bet);
  }

  if (
    message.type == "win" ||
    message.type == "lose" ||
    message.type == "bet"
  ) {
    createMessage(message.type, message.text);
  }

  if (message.type === "money") {
    money = isNaN(message.text) ? 500 : Number(message.text);
  }

  if (message.type === "notificationTime") {
    notificationTime = isNaN(message.text) ? 2 : Number(message.text);
  }

  if (message.type === "runNotification") {
    console.log("Running notification...");
    if (runTimeout) {
      clearTimeout(runTimeout);
    }
    await joinRoom();
  }

  if (message.type === "stopNotification") {
    await setStorageData("isTrigger", false);
    if (runTimeout) {
      clearTimeout(runTimeout);
      runTimeout = null;
      isProcessing = false;
    }
  }

  if (message.type === "updateChatIds") {
    console.log("Updating chat IDs in content script:", message);
    // Update the bot's chat IDs with all three groups
    bot.updateChatIds(
      message.chatIds || [],
      message.chatFakeIds || [],
      message.chatReportIds || []
    );
  }
});

function convertTextToNumber(text) {
  const number = parseFloat(text.replace(/,/g, ""));
  return number;
}

function formatCurrency(value) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const callback = () => {
  try {
    updateUsername(username);
    updateBalance(formatCurrency(balance));
    updateImageMainCenter();
    updateVideoMainCenter();
  } catch (error) { }
};

const observer = new MutationObserver(callback);
observer.observe(document.body, {
  childList: true, // Detect addition/removal of child elements
  subtree: true, // Observe the entire subtree
  attributes: true, // Detect changes to attributes
  characterData: true, // Detect changes to the text content
});

function createMessage(type, text = "", timeout = 1000, endTime = 1000) {
  if (type === "win" || type === "lose" || type === "bet") {
    if (text.length == 0) return;
    balance += convertTextToNumber(text) * (type === "win" ? 1 : -1);
    if (type === "win" || type === "lose") {
      balance += money;
    }
    if (type === "bet") {
      money = convertTextToNumber(text);
    }
    setTimeout(() => {
      updateBalance(formatCurrency(balance));
    }, timeout);
  }

  if (isMobile) {
    createMessageMobile(type, text);
    return;
  }

  const doc = document.getElementById("iframeGame");
  const ifrDoc = doc.contentDocument;

  const message = ifrDoc.createElement("div");
  const p = ifrDoc.createElement("p");

  message.style.cssText = `
    z-index: 100;
    font-family: Arial, Helvetica, sans-serif;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    background-size: 100% 100%;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8));
    bottom: 300px;
    right: -300px;
    transition: right 0.5s ease;
  `;

  const commonStyles = {
    width: "300px",
    height: "52px",
    fontSize: "24px",
    fontWeight: "bold",
    lineHeight: "52px",
    color: "transparent",
    backgroundClip: "text",
    webkitTextFillColor: "transparent",
  };

  const configs = {
    win: {
      backgroundImage: 'url("../../images-web/global-web/message_bg_win.png")',
      className: "message_win",
      textContent: `+${text}`,
      textStyle:
        "linear-gradient(0deg, #FFE5B1 10.26%, #8E630D 34.84%, #B27A1F 44.26%, #EBE0A9 59.75%, #CBAD55 100%)",
    },
    lose: {
      backgroundImage: 'url("../../images-web/global-web/message_bg_lose.png")',
      className: "message_lose",
      textContent: `-${text}`,
      textStyle:
        "linear-gradient(359.91deg, #B10202 10.25%, #FF3F3F 61.25%, #FFA6A6 85%)",
    },
    bet: {
      padding: "8px 16px",
      minWidth: "300px",
      borderRadius: "2px",
      filter: "drop-shadow(0 0 2px rgba(0,0,0,.6))",
      fontSize: "16px",
      lineHeight: "20px",
      color: "#ffffff",
      backgroundImage: "linear-gradient(180deg, #c1e026 0%, #74912d 100%)",
      className: "message_success",
      textContent: "Đặt cược thành công",
      height: "auto",
      lineHeight: "normal",
    },
  };

  const config = configs[type];
  if (!config) return;

  Object.assign(message.style, {
    width: config.width || "auto",
    height: config.height || "auto",
    backgroundImage: config.backgroundImage,
    padding: config.padding || "0",
    borderRadius: config.borderRadius || "0",
    filter: config.filter || "none",
    fontSize: config.fontSize || "16px",
    lineHeight: config.lineHeight || "normal",
    textAlign: "center",
    color: config.color || "initial",
    backgroundImage: config.backgroundImage || "none",
    minWidth: config.minWidth || "auto",
  });

  if (config.className) message.classList.add(config.className);

  p.textContent = config.textContent;
  p.style.backgroundImage = config.textStyle;

  if (type === "win") {
    Object.assign(p.style, commonStyles);

    if (chipCustom) {
      chipCustom.querySelector(".amount_sum").innerText = +text.replace(
        ",",
        ""
      );
      chipCustom.style.transition =
        "transform 1s ease-out, opacity 1s ease-out";
      chipCustom.style.opacity = "0";
      if (betType == "PLAYER") {
        chipCustom.style.transform = "translate(130px , 106px)";
      }
      if (betType == "TIE") {
        chipCustom.style.transform = "translate(0px , 106px)";
      }
      if (betType == "BANKER") {
        chipCustom.style.transform = "translate(-130px , 106px)";
      }
      setTimeout(() => {
        chipCustom.remove();
      }, endTime);
    }
  }

  if (type === "lose") {
    Object.assign(p.style, commonStyles);

    if (chipCustom) {
      chipCustom.querySelector(".amount_sum").innerText = +text.replace(
        ",",
        ""
      );
      chipCustom.style.transition =
        "transform 1s ease-out, opacity 1s ease-out";
      chipCustom.style.opacity = "0";
      if (betType == "PLAYER") {
        chipCustom.style.transform = "translate(130px , -120px)";
      }
      if (betType == "TIE") {
        chipCustom.style.transform = "translate(0px , -120px)";
      }
      if (betType == "BANKER") {
        chipCustom.style.transform = "translate(-130px , -120px)";
      }
      setTimeout(() => {
        chipCustom.remove();
      }, 1000);
    }
  }

  message.appendChild(p);
  ifrDoc.body.appendChild(message);

  setTimeout(() => {
    message.style.right = "48px";
  }, 100);

  setTimeout(() => {
    message.remove();
  }, 2000);
}

function createMessageMobile(type, text) {
  const doc = document.getElementById("iframeGameFullPage");
  const ifrDoc = doc.contentDocument;
  const gamingZone = ifrDoc.querySelector(".gaming_zone");

  const messageWrap = ifrDoc.createElement("div");
  messageWrap.className = "messagebox-wrap";

  if (type == "bet") {
    messageWrap.innerHTML = `<div class="game_info_success">Đặt cược thành công</div>`;
  }

  if (type == "win") {
    messageWrap.innerHTML = `<div class="game_info_win"><p>Thắng</p><h5>+${text}</h5></div>`;

    if (chipCustom) {
      chipCustom.querySelector(".amount_sum").innerText = +text.replace(
        ",",
        ""
      );
      chipCustom.style.transition =
        "transform 1s ease-out, opacity 1s ease-out";
      chipCustom.style.opacity = "0";
      if (betType == "PLAYER") {
        chipCustom.style.transform = "translate(130px , 106px)";
      }
      if (betType == "TIE") {
        chipCustom.style.transform = "translate(0px , 106px)";
      }
      if (betType == "BANKER") {
        chipCustom.style.transform = "translate(-130px , 106px)";
      }
      setTimeout(() => {
        chipCustom.remove();
      }, 1000);
    }
  }

  if (type == "lose") {
    messageWrap.innerHTML = `<div class="game_info_lose"><p>Thua</p><h5>-${text}</h5></div>`;

    if (chipCustom) {
      chipCustom.querySelector(".amount_sum").innerText = +text.replace(
        ",",
        ""
      );
      chipCustom.style.transition =
        "transform 1s ease-out, opacity 1s ease-out";
      chipCustom.style.opacity = "0";
      if (betType == "PLAYER") {
        chipCustom.style.transform = "translate(130px , -120px)";
      }
      if (betType == "TIE") {
        chipCustom.style.transform = "translate(0px , -120px)";
      }
      if (betType == "BANKER") {
        chipCustom.style.transform = "translate(-130px , -120px)";
      }
      setTimeout(() => {
        chipCustom.remove();
      }, 1000);
    }
  }

  gamingZone.appendChild(messageWrap);

  setTimeout(() => {
    messageWrap.remove();
  }, 2000);
}

function handleChip(betMoney = 0, bet) {
  betType = bet;

  if (chipCustom) {
    chipCustom.remove();
  }

  if (isMobile) {
    const doc = document.getElementById("iframeGameFullPage");
    const ifrDoc = doc.contentDocument;
    const betArea =
      ifrDoc.querySelectorAll(".bet-item")[
      betType == "PLAYER" ? 4 : betType == "TIE" ? 5 : 6
      ];
    chipCustom = ifrDoc.createElement("div");
    chipCustom.className = "icon_bet_chips2d_1 w_32 mode_confirm";
    chipCustom.innerHTML = `
    <div class="chips2d-all">
      <div class="chips2d_bg"></div>
    </div>
    <div class="chips2d_amount">
      <div class="amount_sum">${betMoney.toLocaleString("en-US")}</div><
    /div>`;
    betArea.appendChild(chipCustom);
  } else {
    const doc = document.getElementById("iframeGame");
    const ifrDoc = doc.contentDocument;
    const betArea =
      betType == "PLAYER"
        ? ifrDoc.querySelector("#betBoxPlayer")
        : betType == "TIE"
          ? ifrDoc.querySelector("#betBoxTie")
          : ifrDoc.querySelector("#betBoxBanker");
    chipCustom = ifrDoc.createElement("div");
    chipCustom.className = "icon_bet_chips2d mode_confirm";
    chipCustom.style.cssText =
      "position: absolute; opacity: 1; transition: all; top: 15px; left: 48px;";
    chipCustom.innerHTML = `
    <div class="chips2d-all">
      <div class="chips2d_bg"></div>
    </div>
    <div class="chips2d_amount">
      <div class="amount_sum">${betMoney.toLocaleString("en-US")}</div>
    </div>`;
    betArea.appendChild(chipCustom);
  }
}

function updateUsername(text) {
  username = text;

  if (isMobile) {
    updateUsernameMobile(text);
    return;
  }

  const frames = ["iframeGameHall", "iframeGame"];
  for (const frame of frames) {
    try {
      const doc = document.getElementById(frame);
      const ifrDoc = doc.contentDocument;

      try {
        const shadowRoot = ifrDoc.querySelector("menu-web").shadowRoot;
        const usernameSpan = shadowRoot.querySelector(
          ".menu-info__account__title"
        );
        usernameSpan.textContent = text;
      } catch (error) { }

      try {
        const usernameDiv = ifrDoc.querySelector(
          "#app > div > main > div.absolute.right-0.top-0.z-layout.transition-\\[left\\] > div.flex.gap-7\\.5.px-\\[45px\\].web-min\\:justify-end > div:nth-child(1) > div > button > div"
        );
        usernameDiv.textContent = text;
      } catch (error) { }
    } catch (e) { }
  }
}

function updateUsernameMobile(text) {
  const frames = ["iframeGameHall", "iframeGameFullPage"];
  for (const frame of frames) {
    const doc = document.getElementById(frame);
    const ifrDoc = doc.contentDocument;

    try {
      const usernameSpan = ifrDoc.querySelectorAll("span")[0];
      usernameSpan.textContent = text;
    } catch (error) { }

    try {
      const usernameSpan = ifrDoc.querySelector(".mc_header-info__user > p");
      usernameSpan.textContent = text;
    } catch (error) { }
  }
}

function updateBalance(text) {
  balance = convertTextToNumber(text);

  if (isMobile) {
    updateBalanceMobile(text);
    return;
  }

  const frames = ["iframeGameHall", "iframeGame"];
  for (const frame of frames) {
    try {
      const doc = document.getElementById(frame);
      const ifrDoc = doc.contentDocument;

      try {
        const shadowRoot = ifrDoc.querySelector("menu-web").shadowRoot;
        const balanceSpan = shadowRoot.querySelector(
          ".menu-info__balance span:nth-of-type(2)"
        );
        balanceSpan.textContent = text;
      } catch (error) { }

      try {
        const balanceDiv = ifrDoc.querySelector(
          "#app > div > main > div.absolute.right-0.top-0.z-layout.transition-\\[left\\] > div.flex.gap-7\\.5.px-\\[45px\\].web-min\\:justify-end > div.flex.items-center.gap-1.py-2 > div"
        );
        balanceDiv.textContent = text;
      } catch (error) { }
    } catch (e) { }
  }
}

function updateBalanceMobile(text) {
  const frames = ["iframeGameHall", "iframeGameFullPage"];
  for (const frame of frames) {
    const doc = document.getElementById(frame);
    const ifrDoc = doc.contentDocument;

    try {
      const balanceDiv = ifrDoc.querySelectorAll("span")[1];
      balanceDiv.textContent = text;
    } catch (error) { }

    try {
      const balanceDiv = ifrDoc.querySelector(".mc_header-info__money > p");
      balanceDiv.textContent = text;
    } catch (error) { }
  }
}

function updateImageMainCenter() {
  if (isMobile) {
    updateImageMainCenterMobile();
    return;
  }

  const doc = document.getElementById("iframeGame");
  const ifrDoc = doc.contentDocument;
  const mainCenter = ifrDoc.querySelector(".main_center");
  const img = ifrDoc.querySelector("#coverImg") || ifrDoc.createElement("img");
  if (!hideCenter) {
    img.remove();
    return;
  }
  img.id = "coverImg";
  img.src = coverImageBase64
    ? `data:image/png;base64,${coverImageBase64}`
    : "https://htmlcolorcodes.com/assets/images/colors/gray-color-solid-background-1920x1080.png";
  img.style.position = "absolute";
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "cover";
  img.style.zIndex = "999";
  if (ifrDoc.querySelector("#coverImg")) {
    return;
  }
  mainCenter.appendChild(img);
  mainCenter.style.overflow = "hidden";
}

function updateImageMainCenterMobile() {
  const doc = document.getElementById("iframeGameFullPage");
  const ifrDoc = doc.contentDocument;
  const mainCenter = ifrDoc.querySelector(".gaming_zone");
  const img = ifrDoc.querySelector("#coverImg") || ifrDoc.createElement("img");
  if (!hideCenter) {
    img.remove();
    return;
  }
  img.id = "coverImg";
  img.src = coverImageBase64
    ? `data:image/png;base64,${coverImageBase64}`
    : "https://htmlcolorcodes.com/assets/images/colors/gray-color-solid-background-1920x1080.png";
  img.style.position = "absolute";
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "cover";
  img.style.zIndex = "1";
  if (ifrDoc.querySelector("#coverImg")) {
    return;
  }
  mainCenter.appendChild(img);
  mainCenter.style.overflow = "hidden";
}

function updateVideoMainCenter() {
  if (isMobile) {
    updateVideoMainCenterMobile();
    return;
  }

  const doc = document.getElementById("iframeGame");
  const ifrDoc = doc.contentDocument;
  if (ifrDoc.querySelector("#webcamVideo")) {
    if (!videoOn || !hideCenter) {
      ifrDoc.querySelector("#webcamVideo").remove();
    }
    return;
  }
  if (!videoOn || !hideCenter) {
    return;
  }
  const mainCenter = ifrDoc.querySelector(".main_center");
  const video = ifrDoc.createElement("video");
  video.id = "webcamVideo";
  navigator.mediaDevices
    .getUserMedia({ video: true })
    .then((stream) => {
      video.srcObject = stream;
    })
    .catch(console.error);
  video.style.position = "absolute";
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.objectFit = "cover";
  video.style.zIndex = "1000";
  mainCenter.appendChild(video);
  mainCenter.style.overflow = "hidden";
}

function updateVideoMainCenterMobile() {
  const doc = document.getElementById("iframeGameFullPage");
  const ifrDoc = doc.contentDocument;
  const mainCenter = ifrDoc.querySelector(".gaming_zone");
  const img = ifrDoc.querySelector("#coverImg") || ifrDoc.createElement("img");
  if (!hideCenter) {
    img.remove();
    return;
  }
  img.id = "coverImg";
  img.src = coverImageBase64
    ? `data:image/png;base64,${coverImageBase64}`
    : "https://htmlcolorcodes.com/assets/images/colors/gray-color-solid-background-1920x1080.png";
  img.style.position = "absolute";
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "cover";
  img.style.zIndex = "1";
  if (ifrDoc.querySelector("#coverImg")) {
    return;
  }
  mainCenter.appendChild(img);
  mainCenter.style.overflow = "hidden";
}

async function captureScreen() {
  return new Promise((resolve, reject) => {
    const messageListener = (response) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve(response.image);
    };

    try {
      chrome.runtime.sendMessage({ action: "capture_tab" }, messageListener);
    } catch (error) {
      reject(error);
    }
  });
}

async function captureElement(element) {
  if (!element) throw new Error("Element is required");

  const iframe = document.getElementById("iframeGameHall");
  const iframeDoc = iframe?.contentDocument;
  if (!iframeDoc) throw new Error("iframe document not found");

  const scroller = iframeDoc.querySelector(".vue-recycle-scroller");
  if (!scroller) throw new Error("scroller element not found");

  // Lấy bounding rect của element trong iframe viewport
  element.scrollIntoView({ block: "center", inline: "center" });
  await sleep(3);
  const dpr = window.devicePixelRatio || 1;
  const rect = element.getBoundingClientRect();

  // Đợi scroll xong (nên delay 300-500ms)
  // Chụp ảnh toàn trang (cha)
  const fullScreenshot = await captureScreen();

  const image = new Image();
  image.src = fullScreenshot;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Failed to load screenshot image"));
  });

  // Lấy bounding rect iframe trong window cha (vị trí iframe trên trang cha)
  const iframeRect = iframe.getBoundingClientRect();

  // Vị trí crop trong ảnh toàn màn hình:
  const cropX = (iframeRect.left + rect.left) * dpr;
  const cropY = (iframeRect.top + rect.top) * dpr;
  const cropWidth = rect.width * dpr;
  const cropHeight = rect.height * dpr;

  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  return canvas.toDataURL("image/png");
}

function observeGameResult(callback) {
  const iframeGame = document.getElementById("iframeGame");
  if (!iframeGame) return;

  const doc = iframeGame.contentDocument || iframeGame.contentWindow.document;
  const playerPoint = doc.querySelector("#playerHandValue");
  const bankerPoint = doc.querySelector("#bankerHandValue");
  if (!playerPoint || !bankerPoint) return;

  const observer = new MutationObserver(() => {
    const bankerWinClass = "result_win_red";
    const playerWinClass = "result_win_blue";
    const tieClass = "result_tie_green";

    // Chỉ xử lý nếu có class kết quả
    if (
      playerPoint.classList.contains(playerWinClass) ||
      bankerPoint.classList.contains(bankerWinClass) ||
      playerPoint.classList.contains(tieClass) ||
      bankerPoint.classList.contains(tieClass)
    ) {
      callback({
        playerPointValue: playerPoint.textContent.trim(),
        bankerPointValue: bankerPoint.textContent.trim(),
        playerClasses: [...playerPoint.classList],
        bankerClasses: [...bankerPoint.classList],
      });
    }
  });

  observer.observe(playerPoint, {
    attributes: true,
    childList: true,
    subtree: false,
  });
  observer.observe(bankerPoint, {
    attributes: true,
    childList: true,
    subtree: false,
  });
}

async function joinRoom() {
  messageIds = [];
  await sleep(5);

  const curentUrl = window.location.href;
  if (isProcessing || !curentUrl.includes("bpweb")) return;
  console.log("joinRoom");
  isProcessing = true;

  // Start maintenance monitoring when joining room
  startMaintenanceMonitoring();

  // Wait for iframeGameHall to be available
  console.log("Waiting for iframeGameHall to be available...");
  let iframe = null;
  let attempts = 0;
  const maxAttempts = 30; // Wait up to 30 seconds

  while (!iframe && attempts < maxAttempts) {
    iframe = document.getElementById("iframeGameHall");
    if (!iframe) {
      console.log(`Attempt ${attempts + 1}/${maxAttempts}: iframeGameHall not found, waiting...`);
      await sleep(1);
      attempts++;
    }
  }

  if (!iframe) {
    console.error("iframeGameHall not found after maximum attempts");
    isProcessing = false;
    return;
  }

  console.log("iframeGameHall found, proceeding with room logic");

  // Load chat IDs from storage to ensure we're using the most up-to-date list
  try {
    const storage = await chrome.storage.local.get([
      "chatIds",
      "chatFakeIds",
      "chatReportIds",
    ]);

    // Update all chat ID groups in the bot manager
    bot.updateChatIds(
      storage.chatIds || null,
      storage.chatFakeIds || null,
      storage.chatReportIds || null
    );

    console.log("Retrieved chat IDs from storage:");
    console.log("- Main:", storage.chatIds || []);
    console.log("- Fake:", storage.chatFakeIds || []);
    console.log("- Report:", storage.chatReportIds || []);
  } catch (error) {
    console.error("Error retrieving chat IDs from storage:", error);
  }

  console.log("Joining room...");
  let tasks = [...bot.getStartTasks()];
  console.log("Joining room with iframe:", iframe);
  const absolute = iframe.contentDocument.querySelector(
    ".absolute:nth-child(2)"
  );
  if (absolute) {
    absolute.style.display = "none"; // Ẩn thông báo "Chưa có phòng nào"
  }

  // 1. Chụp ảnh danh sách phòng
  const roomArea = iframe.contentDocument.querySelector(
    ".vue-recycle-scroller__item-wrapper"
  );
  if (roomArea) {
    console.log("Capturing room area screenshot...");
    const header = iframe.contentDocument.querySelector("h2");
    header.scrollIntoView();
    await sleep(1);
    const roomAreaScreenshot = await captureScreen();
    tasks.push({
      type: "screenshot",
      data: roomAreaScreenshot,
      content: "ANH EM VÀO SẢNH SEXY NHÉ",
    });
    tasks.push({
      type: "text",
      content:
        "🌟 LINH ĐĂNG KÍ THAM GIA: [LINK ĐĂNG KÝ](https://bl555a3a14q.vipbl555.com/m/register?affiliateCode=bl555a3a14q)\n🔥 NHẬN KHUYẾN MÃI CỰC HOT\nLIÊN HỆ CHO ADMIN : [NHẮN TIN CHO BOSS](https://t.me/PHUONGLANBCR7999) HOẶC [TRỢ LÝ VÂN ANH](https://t.me/TLVANANH68)\n☘️ VỐN ĐIỀU LỆ TẠI GROUD : 3M-50M , LÃI MỖI NGÀY DAO ĐỘNG 30% - 50% 💋",
    });
    tasks.push({
      type: "video",
      content: "",
      filePath: "media/0530.gif.mp4",
    });
  }
  // Run both main and fake group tasks at the same time
  messageIds.push(...(await Promise.all([
    bot.runTasksForMainGroup((res) => {
      console.log(res);
    }, tasks, true),
    bot.runTasksForFakeGroup((res) => { console.log(res); }, tasks, true),
  ])).flat());
  tasks = [];
  const fakeTasks = [];

  // 2. Chọn phòng ngẫu nhiên
  const rooms = iframe.contentDocument.querySelectorAll(
    ".grid > .relative.cursor-pointer"
  );
  console.log("Available rooms:", rooms.length);

  if (!rooms.length) {
    isProcessing = false;
    return;
  }
  const randomIndex = Math.floor(Math.random() * rooms.length);
  const randomRoom = rooms[randomIndex];
  rooms[randomIndex].scrollIntoView();
  const titleRoom =
    randomRoom.querySelector(".flex > span")?.textContent?.trim() ?? "";
  const roomCapture = await captureElement(rooms[randomIndex]);
  let taskReport = [];
  taskReport.push({
    type: "screenshot",
    data: roomCapture,
    content: `CÁC BẠN VÀO ${titleRoom} CHỜ LỆNH NHÉ`,
  });
  messageIds.push(...await bot.runTasksForReportGroup(
    (status) => {
      console.log("Report task completed with status:", status);
    },
    taskReport,
    true
  ));

  console.log("Message IDs:", messageIds);

  rooms[randomIndex].click();

  await sleep(3 * 60); // Chờ 3 phút trước khi bắt đầu đặt cược
  // await sleep(5);
  fakeTasks.push({
    type: "text",
    content: `TAY SAU VÀO LỆNH`,
  });

  // 3. Tạo task cược ban đầu
  const listTask = ["CON", "CÁI"];
  const currentTask = listTask[Math.floor(Math.random() * listTask.length)];
  const moneyValue = money || 500;
  messageIds.push(...(await bot.runTasksForMainGroup(
    () => { },
    [
      {
        type: "text",
        content: `TAY SAU VÀO LỆNH`,
      },
      {
        type: "text",
        content: `${currentTask} ${moneyValue}`,
      },
    ],
    true
  )));

  // 4. Theo dõi kết quả bằng MutationObserver
  const iframeGame = document.getElementById("iframeGame");
  if (!iframeGame) return;
  const doc = iframeGame.contentDocument || iframeGame.contentWindow.document;
  const playerPoint = doc.querySelector("#gameWinnerPlayer");
  const bankerPoint = doc.querySelector("#gameWinnerBanker");
  if (!playerPoint || !bankerPoint) {
    isProcessing = false;
    return;
  }

  const bankerWinClass = "result_win_red";
  const playerWinClass = "result_win_blue";
  const tieClass = "result_tie_green";

  // Check if gameInfoCard is hidden before setting up the observer
  const gameInfoCard = doc.querySelector("#gameInfoCard");
  console.log("gameInfoCard:", gameInfoCard);

  const waitForGameInfoCardHidden = () => {
    if (!gameInfoCard || gameInfoCard.style.display === "none") {
      console.log("Game info card is hidden, setting up result observer...");
      setupResultObserver();
    } else {
      console.log("Waiting for game info card to be hidden...");
      setTimeout(waitForGameInfoCardHidden, 1000); // Check again in 1 second
    }
  };

  const setupResultObserver = () => {
    console.log("Observing game results...");
    const observer = new MutationObserver(async () => {
      isProcessing = false;
      // Chỉ xử lý khi có các class kết quả
      console.log(playerPoint.classList, bankerPoint.classList);
      const menuTop = iframeGame.contentDocument.querySelector("#menu-top");
      if (menuTop) {
        menuTop.style.display = "none";
      }
      const playerHasResult =
        playerPoint.classList.contains(playerWinClass) ||
        playerPoint.classList.contains(tieClass);
      const bankerHasResult =
        bankerPoint.classList.contains(bankerWinClass) ||
        bankerPoint.classList.contains(tieClass);
      console.log(
        "Player has result:",
        playerHasResult,
        "Banker has result:",
        bankerHasResult
      );
      if (playerHasResult || bankerHasResult) {
        const playerPointValue = playerPoint
          .querySelector("#playerHandValue")
          .textContent.trim();
        const bankerPointValue = bankerPoint
          .querySelector("#bankerHandValue")
          .textContent.trim();
        let bestType = "";
        if (playerPointValue && bankerPointValue) {
          if (playerPointValue > bankerPointValue) {
            bestType = "PLAYER";
          } else if (playerPointValue < bankerPointValue) {
            bestType = "BANKER";
          } else {
            bestType = "TIE";
          }
          console.log(
            "Best type determined:",
            bestType,
            "Player:",
            playerPointValue,
            "Banker:",
            bankerPointValue
          );

          let status = "";
          let moneyValueTmp = moneyValue || 500;
          let task_status = null;

          if (currentTask === "CON" && bestType === "PLAYER") {
            task_status = { type: "text", content: `H +${moneyValueTmp}` };
            status = "win";
          } else if (currentTask === "CÁI" && bestType === "BANKER") {
            task_status = { type: "text", content: `H +${moneyValueTmp}` };
            status = "win";
          } else if (bestType === "TIE") {
            status = "win";
            moneyValueTmp = 0;
            task_status = { type: "text", content: "HOA +0" };
          } else {
            status = "lose";
            task_status = { type: "text", content: `G -${moneyValueTmp}` };
          }
          createMessage(status, moneyValueTmp + "", 1000, 3000);
          await sleep(1);
          // capture game result
          const gameResultScreenshot = await captureScreen();
          tasks.push({
            type: "screenshot",
            data: gameResultScreenshot,
          });
          tasks.push(task_status);
          tasks.push(
            status === "lose"
              ? { type: "photo", content: "", filePath: "media/cl.png" }
              : { type: "text", content: "NGƯNG CA CHỐT LÃI!!!" }
          );
          fakeTasks.push({
            type: "text",
            content: `${bestType === "PLAYER" ? "CON" : "CÁI"
              } ${moneyValueTmp}`,
          });
          fakeTasks.push({
            type: "screenshot",
            data: gameResultScreenshot,
          });
          fakeTasks.push({
            type: "text",
            content: bestType !== "TIE" ? `H +${moneyValueTmp}` : `HOA +0`,
          });
        }

        console.log("Tasks sau khi có kết quả:", tasks, fakeTasks);
        observer.disconnect();
        messageIds.push(...(await Promise.all([
          bot.runTasksForMainGroup(() => { }, tasks),
          bot.runTasksForFakeGroup(() => { }, fakeTasks),
        ])).flat());

        console.log("Message IDs:", messageIds);

        isProcessing = false;
        console.log("Rejoining room...");
        runTimeout = setTimeout(async () => {
          await setStorageData("isTrigger", true);
          chrome.runtime.sendMessage({ type: "reloadSession" });
          // // Thoát phòng
          // const btnOut = doc.querySelector("#goHome2");
          // console.log("Exiting room...", btnOut);

          // if (btnOut) {
          //   btnOut.click();
          // }
          // console.log("Room exited, waiting for next join...");
          // joinRoom();
          // send
        }, notificationTime * 60 * 1000);
      }
    });

    observer.observe(playerPoint, { attributes: true, childList: true });
    observer.observe(bankerPoint, { attributes: true, childList: true });
  };

  // Start the waiting process
  waitForGameInfoCardHidden();
}
