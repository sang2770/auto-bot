let htmlString = `
    <div>
        <div class="block">
            <div class="row">
                <label>Giao diện Mobile</label>
                <input id="mobile-input" type="checkbox" />
            </div>

            <div class="row">
                <label>Ảnh che</label>
                <input id="image-input" type="file" accept="image/png, image/jpeg, image/gif, image/webp" />
            </div>

            <div class="row">
                <label>Live cam</label>
                <input id="video-input" type="checkbox" />
            </div>

            <div class="row">
                <button class="blue-btn" id="toggle-center">Ẩn/hiện phần che</label>
            </div>

            <div class="row">
                <div class="col">
                    <button class="blue-btn" id="username">Đặt username</button>
                    <input id="username-input" autocomplete="off" />
                </div>
                <div class="col">
                    <button class="blue-btn" id="balance">Đặt số dư</button>
                    <input id="balance-input" autocomplete="off" />
                </div>
            </div>
        </div>

        <div class="block col">
            <div class="row">
              <div class="col">Mức cược:</div>
              <div class="col">
                <input id="money-input" autocomplete="off" />
              </div>
            </div>
            <div class="row">
                <button class="blue-btn" id="bet">Đặt cược</button>
                <button class="blue-btn" id="player-chip">Player</button>
                <button class="blue-btn" id="tie-chip">Tie</button>
                <button class="blue-btn" id="banker-chip">Banker</button>
            </div>
            <div class="row">
                <button class="green-btn" id="win-small">Thắng con</button>
                <button class="green-btn" id="win-big">Thắng cái</button>
                <button class="blue-btn" id="draw">Hoà</button>
                <button class="red-btn" id="lose">Thua</button>
            </div>
        </div>
      
        <div class="block">
          <div class="row">
            <label>Thời gian thông báo (phút):</label>
            <input id="notification-time" type="number" value="2" />
          </div>
          <div class="row">
            <label>IDs Nhóm Chính (phân cách bằng dấu phẩy):</label>
            <input id="chat-ids" type="text" placeholder="Ví dụ: 123456789,-987654321" />
          </div>
          <div class="row">
            <label>IDs Nhóm Ảo (phân cách bằng dấu phẩy):</label>
            <input id="chat-fake-ids" type="text" placeholder="Ví dụ: 123456789,-987654321" />
          </div>
          <div class="row">
            <label>IDs Nhóm Báo bàn (phân cách bằng dấu phẩy):</label>
            <input id="chat-report-ids" type="text" placeholder="Ví dụ: 123456789,-987654321" />
          </div>
          <div class="row">
            <button class="blue-btn" id="save-chat-ids">Lưu Chat IDs</button>
          </div>
          <button class="blue-btn" id="run-notification">Chạy thông báo</button>
          <button class="blue-btn" id="stop-notification">Dừng thông báo</button>
        </div>
    </div>
`;


// ==========================
// Khởi tạo giao diện chính
// ==========================
(async () => {
  // Load communication script
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('communication.js');
  document.head.appendChild(script);

  const storage = await chrome.storage.local.get(['chatIds', 'chatFakeIds', 'chatReportIds']);
  const chatIds = storage.chatIds || [];
  const chatFakeIds = storage.chatFakeIds || [];
  const chatReportIds = storage.chatReportIds || [];

  // Hiển thị giao diện chính
  document.body.innerHTML = htmlString;
  addEventListener();

  // Populate chat IDs from storage
  if (chatIds.length > 0) {
    document.getElementById('chat-ids').value = chatIds.join(', ');
  }

  // Populate fake chat IDs from storage
  if (chatFakeIds.length > 0) {
    document.getElementById('chat-fake-ids').value = chatFakeIds.join(', ');
  }

  // Populate report chat IDs from storage
  if (chatReportIds.length > 0) {
    document.getElementById('chat-report-ids').value = chatReportIds.join(', ');
  }

  // Initialize WebSocket communication after a short delay to ensure script is loaded
  setTimeout(() => {
    if (window.wsComm) {
      console.log('WebSocket communication initialized');
    }
  }, 1000);
})();

// ==========================
// Các hàm điều khiển sự kiện
// ==========================
const addEventListener = () => {
  document.getElementById('toggle-center')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'toggleCenter' });
  });

  document.getElementById('image-input')?.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const base64String = e.target.result.split(',')[1];
        chrome.runtime.sendMessage({
          type: 'imageCover',
          text: base64String,
        });
      };
      reader.readAsDataURL(file);
    }
  });

  document.getElementById('video-input')?.addEventListener('change', () => {
    const input = document.getElementById('video-input');
    chrome.runtime.sendMessage({
      type: 'videoCover',
      text: input.checked,
    });
  });

  document.getElementById('username')?.addEventListener('click', () => {
    const input = document.getElementById('username-input');
    chrome.runtime.sendMessage({
      type: 'username',
      text: input.value,
    });
  });

  document.getElementById('balance')?.addEventListener('click', () => {
    const input = document.getElementById('balance-input');
    chrome.runtime.sendMessage({
      type: 'balance',
      text: formatNumber(+input.value),
    });
  });

  document.getElementById('bet')?.addEventListener('click', () => {
    const input = document.getElementById('money-input');
    chrome.runtime.sendMessage({
      type: 'bet',
      text: formatNumber(+input.value),
    });
  });

  document.getElementById('player-chip')?.addEventListener('click', () => {
    const input = document.getElementById('money-input');
    chrome.runtime.sendMessage({
      type: 'chip',
      text: +input.value,
      bet: 'PLAYER',
    });
  });

  document.getElementById('tie-chip')?.addEventListener('click', () => {
    const input = document.getElementById('money-input');
    chrome.runtime.sendMessage({
      type: 'chip',
      text: +input.value,
      bet: 'TIE',
    });
  });

  document.getElementById('banker-chip')?.addEventListener('click', () => {
    const input = document.getElementById('money-input');
    chrome.runtime.sendMessage({
      type: 'chip',
      text: +input.value,
      bet: 'BANKER',
    });
  });

  document.getElementById('draw')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'win',
      text: formatNumber(0),
    });
  });

  document.getElementById('win-small')?.addEventListener('click', () => {
    const input = document.getElementById('money-input');
    chrome.runtime.sendMessage({
      type: 'win',
      text: formatNumber(+input.value),
    });
  });

  document.getElementById('win-big')?.addEventListener('click', () => {
    const input = document.getElementById('money-input');
    chrome.runtime.sendMessage({
      type: 'win',
      text: formatNumber(+input.value * 0.95),
    });
  });

  document.getElementById('lose')?.addEventListener('click', () => {
    const input = document.getElementById('money-input');
    chrome.runtime.sendMessage({
      type: 'lose',
      text: formatNumber(+input.value),
    });
  });

  document.getElementById('money-input')?.addEventListener('change', () => {
    const input = document.getElementById('money-input');
    chrome.runtime.sendMessage({
      type: 'money',
      text: formatNumber(+input.value),
    });
  });

  document.getElementById('notification-time')?.addEventListener('change', () => {
    const input = document.getElementById('notification-time');
    chrome.runtime.sendMessage({
      type: 'notificationTime',
      text: formatNumber(+input.value * 60 * 1000),
    });
  });

  document.getElementById('run-notification')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'runNotification',
    });
    // disable the button after running
    document.getElementById('run-notification').disabled = true;
  });

  document.getElementById('stop-notification')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'stopNotification',
    });
    // enable the button after stopping
    document.getElementById('run-notification').disabled = false;
  });

  document.getElementById('mobile-input')?.addEventListener('change', () => {
    const input = document.getElementById('mobile-input');
    chrome.runtime.sendMessage({
      type: 'isMobile',
      text: input.checked,
    });
  });

  // Add chat IDs handler (by group)
  document.getElementById('save-chat-ids')?.addEventListener('click', async () => {
    const input = document.getElementById('chat-ids');
    const inputFake = document.getElementById('chat-fake-ids');
    const inputReport = document.getElementById('chat-report-ids');

    // Helper to parse IDs string to array of numbers
    const parseIds = (str) =>
      str
        .split(',')
        .map(id => id.trim())
        .filter(id => id)
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));

    const chatIds = parseIds(input.value.trim());
    const chatFakeIds = parseIds(inputFake.value.trim());
    const chatReportIds = parseIds(inputReport.value.trim());

    // Save all groups to storage
    await chrome.storage.local.set({
      chatIds,
      chatFakeIds,
      chatReportIds
    });

    // Send to background script
    chrome.runtime.sendMessage({
      type: 'updateChatIds',
      chatIds,
      chatFakeIds,
      chatReportIds
    });

    // Provide feedback
    alert(
      `Đã lưu:\n- Nhóm chính: ${chatIds.length}\n- Nhóm ảo: ${chatFakeIds.length}\n- Nhóm báo bàn: ${chatReportIds.length}`
    );
  });
};

const formatNumber = (num) => {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
