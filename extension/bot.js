class BotManager {
    constructor() {
        // ======================= CONFIG =======================
        this.config = {
            botToken: "8451047937:AAHcBaSM-cLzDuzUqXmdSLkIwnx6dn8xLzg",
            chatIds: ["-4969340868"],
            startTasks: [
                { type: "video", content: "", filePath: "media/lc1.mp4" },
                { type: "video", content: "", filePath: "media/lc2.mp4" },
                { type: "video", content: "", filePath: "media/lc3.mp4" },
            ],
            tasks: [
                // { type: "text", content: "" },
                // { type: "photo", content: "G -500", filePath: "media/in.png" },
                // { type: "text", content: "NGƯNG CA CHỐT LỖ!!!" },
            ],
            endTasks: [
                { type: "video", content: "", filePath: "media/kt2.mp4" },
                { type: "photo", content: "", filePath: "media/lc.jpg" }
            ]
        };
        // =======================================================
        this.baseUrl = `https://api.telegram.org/bot${this.config.botToken}`;
    }

    async sendText(chatId, text, parse_mode = "Markdown") {
        return this._sendRequestJSON("sendMessage", { chat_id: chatId, text, parse_mode });
    }

    async sendPhoto(chatId, filePath, caption = "") {
        const blob = await this._getFileBlob(filePath);
        if (!blob) return { ok: false, error: `Không tìm thấy file: ${filePath}` };

        const form = new FormData();
        form.append("chat_id", chatId);
        form.append("photo", blob, filePath.split("/").pop());
        if (caption) form.append("caption", caption);

        return this._sendRequestForm("sendPhoto", form);
    }

    async sendPhotoFromBase64(chatId, base64Data, caption = "") {
        // Chuyển base64 sang Blob
        const blob = await this.base64ToBlob(base64Data);
        const formData = new FormData();
        formData.append("chat_id", chatId);
        formData.append("caption", caption);
        formData.append("photo", blob, "capture.png");
        return this._sendRequestForm("sendPhoto", formData);
    }

    base64ToBlob(base64) {
        return fetch(base64).then(res => res.blob());
    }

    async sendVideo(chatId, filePath, caption = "") {
        const blob = await this._getFileBlob(filePath);
        if (!blob) return { ok: false, error: `Không tìm thấy file: ${filePath}` };

        const form = new FormData();
        form.append("chat_id", chatId);
        form.append("video", blob, filePath.split("/").pop());
        if (caption) form.append("caption", caption);

        return this._sendRequestForm("sendVideo", form);
    }

    getStartTasks() {
        return this.config.startTasks;
    }

    async runStartTasks(statusCallback) {
        return this.runTasks(statusCallback, this.config.startTasks, true);
    }

    async runTasks(statusCallback, tasks = [], ignoreEndTasks = false) {
        const listTasks = [...tasks];
        if (!ignoreEndTasks) {
            listTasks.push(...this.config.endTasks);
        }
        for (let task of listTasks) {
            for (let chatId of this.config.chatIds) {
                statusCallback(`📤 Gửi ${task.type} đến ${chatId}...`);

                let res;
                if (task.type === "text") {
                    res = await this.sendText(chatId, task.content);
                } else if (task.type === "photo") {
                    res = await this.sendPhoto(chatId, task.filePath, task.content);
                } else if (task.type === "video") {
                    res = await this.sendVideo(chatId, task.filePath, task.content);
                } else if (task.type === "screenshot") {
                    res = await this.sendPhotoFromBase64(chatId, task.data, task.content);
                } else {
                    statusCallback(`⚠️ Loại không hỗ trợ: ${task.type}`);
                    continue;
                }

                statusCallback(JSON.stringify(res));
                await this._delay(2000);
            }
        }
        statusCallback("✅ Hoàn thành gửi tin!");
    }

    async _sendRequestJSON(method, body) {
        try {
            const res = await fetch(`${this.baseUrl}/${method}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            return await res.json();
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    async _sendRequestForm(method, formData) {
        try {
            const res = await fetch(`${this.baseUrl}/${method}`, {
                method: "POST",
                body: formData
            });
            return await res.json();
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    async _getFileBlob(relativePath) {
        try {
            const url = chrome.runtime.getURL(relativePath);
            const response = await fetch(url);
            if (!response.ok) return null;
            return await response.blob();
        } catch {
            return null;
        }
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Method to update chatIds from UI
    updateChatIds(chatIds, chatFakeIds, chatReportIds) {
        console.log('Updating bot chat IDs:');
        console.log('- Main IDs:', chatIds);
        console.log('- Fake IDs:', chatFakeIds);
        console.log('- Report IDs:', chatReportIds);

        // Update all ID groups if provided
        if (Array.isArray(chatIds)) {
            this.config.chatIds = chatIds.map(id => id.toString());
        }

        if (Array.isArray(chatFakeIds)) {
            this.config.chatFakeIds = chatFakeIds.map(id => id.toString());
        }

        if (Array.isArray(chatReportIds)) {
            this.config.chatReportIds = chatReportIds.map(id => id.toString());
        }
    }

    // Add methods to send to specific groups
    async runTasksForMainGroup(statusCallback, tasks = [], ignoreEndTasks = false) {
        return this._runTasksForGroup(statusCallback, tasks, this.config.chatIds, ignoreEndTasks);
    }

    async runTasksForFakeGroup(statusCallback, tasks = [], ignoreEndTasks = false) {
        return this._runTasksForGroup(statusCallback, tasks, this.config.chatFakeIds || [], ignoreEndTasks);
    }

    async runTasksForReportGroup(statusCallback, tasks = [], ignoreEndTasks = false) {
        return this._runTasksForGroup(statusCallback, tasks, this.config.chatReportIds || [], ignoreEndTasks);
    }

    // Helper method to run tasks for a specific group
    async _runTasksForGroup(statusCallback, tasks = [], chatIds = [], ignoreEndTasks = false) {
        if (!chatIds || chatIds.length === 0) {
            statusCallback("⚠️ No chat IDs configured for this group");
            return;
        }
        if (!ignoreEndTasks) {
            tasks.push(...this.config.endTasks);
        }

        for (let task of tasks) {
            for (let chatId of chatIds) {
                statusCallback(`📤 Gửi ${task.type} đến ${chatId}...`);

                let res;
                if (task.type === "text") {
                    res = await this.sendText(chatId, task.content);
                } else if (task.type === "photo") {
                    res = await this.sendPhoto(chatId, task.filePath, task.content);
                } else if (task.type === "video") {
                    res = await this.sendVideo(chatId, task.filePath, task.content);
                } else if (task.type === "screenshot") {
                    res = await this.sendPhotoFromBase64(chatId, task.data, task.content);
                } else {
                    statusCallback(`⚠️ Loại không hỗ trợ: ${task.type}`);
                    continue;
                }

                statusCallback(JSON.stringify(res));
                await this._delay(2000);
            }
        }
        statusCallback("✅ Hoàn thành gửi tin!");
    }
}
