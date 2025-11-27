const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

// ======================================================
// 0. INDEXEDDB HANDLER
// ======================================================
const DB_NAME = 'TodoayDB';
const DB_VERSION = 2;
const STORE_TODOS = 'todos';
const STORE_SETTINGS = 'settings';

const db = {
    open: () => {
        return new Promise((resolve, reject) => {
            if (navigator.storage && navigator.storage.persist) {
                navigator.storage.persist();
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                // Tạo bảng todos nếu chưa có
                if (!database.objectStoreNames.contains(STORE_TODOS)) {
                    database.createObjectStore(STORE_TODOS, { keyPath: 'id' });
                }
                // Tạo bảng settings nếu chưa có
                if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
                    database.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
                }
            };

            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    // --- TODO METHODS ---
    getAllTodos: async () => {
        const database = await db.open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_TODOS, 'readonly');
            const store = tx.objectStore(STORE_TODOS);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    addTodo: async (todoItem) => {
        const database = await db.open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_TODOS, 'readwrite');
            const store = tx.objectStore(STORE_TODOS);
            store.add(todoItem);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    },

    updateTodo: async (todoItem) => {
        const database = await db.open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_TODOS, 'readwrite');
            const store = tx.objectStore(STORE_TODOS);
            store.put(todoItem);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    },

    // --- SETTINGS METHODS ---
    getSetting: async (key) => {
        const database = await db.open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_SETTINGS, 'readonly');
            const store = tx.objectStore(STORE_SETTINGS);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result ? request.result.value : null);
            request.onerror = () => reject(request.error);
        });
    },

    saveSetting: async (key, value) => {
        const database = await db.open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_SETTINGS, 'readwrite');
            const store = tx.objectStore(STORE_SETTINGS);
            store.put({ key: key, value: value });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }
};

// ======================================================
// 1. GESTURE LOGIC
// ======================================================
(function () {
    const LONG_PRESS_DURATION = 500;
    const SWIPE_THRESHOLD = 30;
    const MOVE_TOLERANCE = 10;
    let timer = null;
    let startX = 0;
    let startY = 0;
    let isLongPressActive = false;
    let hasSwiped = false;

    function reset() {
        clearTimeout(timer);
        isLongPressActive = false;
        hasSwiped = false;
        timer = null;
    }

    document.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        timer = setTimeout(() => {
            isLongPressActive = true;
            e.target.dispatchEvent(new CustomEvent("long-press", { bubbles: true }));
        }, LONG_PRESS_DURATION);
    }, { passive: false });

    document.addEventListener("touchmove", function (e) {
        const touch = e.touches[0];
        const diffX = touch.clientX - startX;
        const diffY = touch.clientY - startY;

        if (!isLongPressActive) {
            if (Math.abs(diffX) > MOVE_TOLERANCE || Math.abs(diffY) > MOVE_TOLERANCE) reset();
            return;
        }

        if (isLongPressActive && !hasSwiped) {
            e.preventDefault();
            if (Math.abs(diffX) > SWIPE_THRESHOLD || Math.abs(diffY) > SWIPE_THRESHOLD) {
                let direction = "";
                if (Math.abs(diffX) > Math.abs(diffY)) direction = diffX > 0 ? "right" : "left";
                else direction = diffY > 0 ? "down" : "up";

                e.target.dispatchEvent(new CustomEvent("long-press-swipe", {
                    bubbles: true,
                    detail: { direction: direction }
                }));
                hasSwiped = true;
            }
        }
    }, { passive: false });

    document.addEventListener("touchend", reset);
    document.addEventListener("touchcancel", reset);
})();

// ======================================================
// 2. APP STATE & DOM ELEMENTS
// ======================================================
const notes = $(".notes");
const mainPage = $(".main");
const inputPage = $(".input");
const settingsPage = $(".settings");
const swipEffect = $('.hold-swip');

const inpTodo = $("#inp-todo");
const inpIsReminder = $('#is-reminder');
const inpDatetime = $('#inp-datetime');
const btnAddTodo = $("#btn-add-todo");

// Settings Elements
const inpApiKey = $("#api-key");
const inpApiModel = $("#api-model");
const btnSaveSetting = $("#save-setting");
const btnOpenSettings = $("#btn-open-settings");

// Global Configuration
let CONFIG = {
    API_KEY: "",
    MODEL_NAME: "gemini-2.5-flash"
};

// ======================================================
// 3. LOGIC FUNCTIONS
// ======================================================

function downloadICS(summary, startDate, endDate) {
    const formatDate = (date) => date.toISOString().replace(/-|:|\.\d+/g, '');
    const start = formatDate(startDate);
    const end = formatDate(endDate);
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Todoay//VN
BEGIN:VEVENT
UID:${Date.now()}@todoay
DTSTAMP:${start}
DTSTART:${start}
DTEND:${end}
SUMMARY:${summary}
DESCRIPTION:Todoay Reminder
BEGIN:VALARM
TRIGGER:-PT0M
ACTION:DISPLAY
DESCRIPTION:Reminder
END:VALARM
END:VEVENT
END:VCALENDAR`;
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `${summary || 'reminder'}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function renderNotes() {
    try {
        const allTodos = await db.getAllTodos();
        allTodos.sort((a, b) => b.id - a.id);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        const filteredTodos = allTodos.filter(t => {
            if (!t.isDone) return true;
            return t.doneTime && t.doneTime >= startOfToday;
        });

        notes.innerHTML = filteredTodos.map((t) => {
            return `<div class="note${t.isDone ? " done" : ""}"
                ${!t.isDone ? `onclick="toggleTodo(${t.id}, true)"` : `ondblclick="toggleTodo(${t.id}, false)"`}>
                <span>${t.todo}</span>
            </div>`
        }).join("");

        if (filteredTodos.length === 0) {
            notes.innerHTML = `<div style="opacity: 0.5; font-style: italic;">All clear for today!</div>`;
        }
    } catch (error) { console.error("Render error:", error); }
}

function switchPage(targetPage) {
    $$('.page').forEach(p => p.classList.remove('show'));
    targetPage.classList.add('show');
    swipEffect.classList.add('hidden');
}

window.toggleTodo = async function (id, state) {
    const allTodos = await db.getAllTodos();
    const todo = allTodos.find(t => t.id === id);
    if (todo) {
        todo.isDone = state;
        todo.doneTime = state ? Date.now() : null;
        await db.updateTodo(todo);
        renderNotes();
    }
}

// Load Settings từ DB khi khởi động
async function loadSettings() {
    try {
        const key = await db.getSetting('api_key');
        const model = await db.getSetting('api_model');

        if (key) CONFIG.API_KEY = key;
        if (model) CONFIG.MODEL_NAME = model;

        // Update UI value
        inpApiKey.value = CONFIG.API_KEY;
        inpApiModel.value = CONFIG.MODEL_NAME;

        console.log("Settings loaded:", CONFIG);
    } catch (e) {
        console.error("Load setting failed", e);
    }
}

// ======================================================
// 4. GEMINI & VOICE LOGIC
// ======================================================
class GeminiCaller {
    constructor() { }

    async _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async call(text, fileBlob, schema) {
        if (!CONFIG.API_KEY) {
            throw new Error("API Key chưa được cấu hình. Vui lòng vào Cài đặt.");
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.MODEL_NAME}:generateContent?key=${CONFIG.API_KEY}`;

        const parts = [{ text: text }];
        if (fileBlob) {
            const base64Data = await this._blobToBase64(fileBlob);
            parts.push({ inlineData: { mimeType: fileBlob.type || "audio/mp4", data: base64Data } });
        }

        const requestBody = { contents: [{ parts: parts }] };
        if (schema) {
            requestBody.generationConfig = { responseMimeType: "application/json", responseSchema: schema };
        }

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error((await response.json()).error?.message || "Lỗi API");
        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text;
        return schema ? JSON.parse(rawText) : rawText;
    }
}

const TODO_SCHEMA = {
    type: "OBJECT",
    properties: {
        type: { 
            type: "STRING", 
            enum: ["note", "reminder"],
            description: "Phân loại: 'reminder' nếu có yếu tố thời gian cụ thể cần nhắc nhở, 'note' nếu chỉ là ghi chú thông tin."
        },
        content: { 
            type: "STRING", 
            description: "Nội dung chính của công việc, ngắn gọn, súc tích." 
        },
        active_time: { 
            type: "STRING", 
            description: "Thời gian nhắc nhở chính xác theo định dạng ISO 8601 rút gọn: 'YYYY-MM-DDTHH:mm'. Nếu là 'note' hoặc không rõ thời gian thì trả về null." 
        }
    },
    required: ["type", "content", "active_time"]
};

function createDynamicPrompt() {
    // 1. Lấy thời gian hiện tại của người dùng
    const now = new Date();

    // Format thời gian cho AI dễ hiểu (VD: Thứ Tư, 26/11/2025 15:30)
    // Việc đưa cả Thứ (Weekday) giúp AI tính "Thứ 6 tuần sau" chính xác hơn.
    const timeString = now.toLocaleTimeString('vi-VN', {
        weekday: 'long',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    // 2. Tạo Prompt
    return `
    Bạn là trợ lý quản lý công việc (Todo App Assistant).
    
    THÔNG TIN NGỮ CẢNH:
    - Thời gian hiện tại là: "${timeString}"
    
    NHIỆM VỤ:
    - Nghe đoạn ghi âm và trích xuất nội dung công việc.
    - Xác định loại là "note" (ghi chú) hay "reminder" (nhắc nhở).
    - Nếu là "reminder", hãy tính toán thời gian kích hoạt (active_time) dựa trên thời gian hiện tại đã cung cấp ở trên.
    
    QUY TẮC active_time:
    - Phải chuyển đổi các cụm từ như "chiều nay", "sáng mai", "30 phút nữa" thành ngày giờ cụ thể.
    - Định dạng BẮT BUỘC: "YYYY-MM-DDTHH:mm" (Ví dụ: 2024-11-26T15:00).
    - Nếu không có thời gian cụ thể, trả về null.
    `;
}

const micButton = $("#btn-mic");
const micOn = $('.mic-on');
const gemini = new GeminiCaller();
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

micButton.addEventListener('click', async () => {
    if (!CONFIG.API_KEY) {
        alert("Vui lòng nhập Gemini API Key trong phần Cài đặt (⚙️) trước!");
        switchPage(settingsPage);
        return;
    }

    micOn.classList.add("active");
    micOn.classList.remove("pendding");

    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];

            // Xử lý MIME type cho Safari/Chrome
            let mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
            try { mediaRecorder = new MediaRecorder(stream, { mimeType }); }
            catch { mediaRecorder = new MediaRecorder(stream); }

            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop());
                const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });

                try {
                    micOn.classList.remove("active");
                    micOn.classList.add("pendding");

                    const prompt = createDynamicPrompt()

                    console.log("call gemini")
                    const result = await gemini.call(prompt, audioBlob, TODO_SCHEMA);

                    console.log(result)

                    inpTodo.value = result["content"];
                    inpIsReminder.checked = (result["type"] === 'reminder');
                    inpDatetime.value = result["active_time"];
                } catch (error) {
                    alert("Lỗi AI: " + error.message);
                } finally {
                    micOn.classList.remove("active", "pendding");
                }
            };

            mediaRecorder.start();
            isRecording = true;
        } catch (err) {
            alert("Lỗi Mic: " + err.message);
            micOn.classList.remove("active");
        }
    } else {
        if (mediaRecorder) mediaRecorder.stop();
        isRecording = false;
    }
});

// ======================================================
// 5. EVENT LISTENERS
// ======================================================

// Register Service Worker

// if ('serviceWorker' in navigator) {
//     window.addEventListener('load', () => {
//         navigator.serviceWorker.register('./sw.js')
//         .then(reg => console.log('SW Registered!', reg.scope))
//         .catch(err => console.log('SW Registration failed', err));
//     });
// }

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js?v=3') 
        .then(registration => {
            console.log('SW Registered!', registration.scope);

            registration.onupdatefound = () => {
                const installingWorker = registration.installing;
                if (installingWorker == null) return;

                installingWorker.onstatechange = () => {
                    if (installingWorker.state === 'installed') {
                        if (navigator.serviceWorker.controller) {
                            console.log('Phát hiện update mới. Đang làm mới...');
                        }
                    }
                };
            };
        })
        .catch(err => console.log('SW Registration failed', err));

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                window.location.reload();
                refreshing = true;
            }
        });
    });
}

// Init
loadSettings();
renderNotes();

// Add Todo
btnAddTodo.addEventListener('click', async () => {
    const content = inpTodo.value.trim();
    if (!content) { alert("Vui lòng nhập nội dung!"); return; }

    let newTodo = {
        id: Date.now(),
        todo: content,
        isDone: false,
        doneTime: null,
        hasReminder: false
    };

    if (inpIsReminder.checked) {
        if (!inpDatetime.value) { alert("Nhập ngày giờ!"); return; }
        const startDate = new Date(inpDatetime.value);
        downloadICS(content, startDate, new Date(startDate.getTime() + 3600000));
        newTodo.todo = `📅 ${content}`;
        newTodo.hasReminder = true;
        newTodo.reminderTime = startDate.toISOString();
    }

    await db.addTodo(newTodo);
    renderNotes();
    switchPage(mainPage);
    inpTodo.value = ""; inpIsReminder.checked = false; inpDatetime.value = "";
});

// Mở trang Settings
// btnOpenSettings.addEventListener('click', () => {
//     switchPage(settingsPage);
// });

// Lưu Settings
btnSaveSetting.addEventListener('click', async () => {
    const key = inpApiKey.value.trim();
    const model = inpApiModel.value.trim();

    if (!key) { alert("Chưa nhập API Key!"); return; }

    await db.saveSetting('api_key', key);
    await db.saveSetting('api_model', model || "gemini-2.5-flash");

    // Update lại Config
    CONFIG.API_KEY = key;
    CONFIG.MODEL_NAME = model;

    alert("Đã lưu cài đặt!");
    switchPage(mainPage);
});



// ======================================================
// LOGIC HISTORY
// ======================================================

const historiesPage = $(".histories");
const historyList = $(".histories");

// Hàm format thời gian sang dạng đẹp (VD: 14:30 27/11/2025)
function formatTime(timestamp) {
    if (!timestamp) return "---";
    const date = new Date(timestamp);
    return date.toLocaleString('vi-VN', {
        hour: '2-digit', minute: '2-digit',
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

function formatTime(timestamp) {
    if (!timestamp) return "---";
    const date = new Date(timestamp);
    return date.toLocaleString('vi-VN', {
        hour: '2-digit', minute: '2-digit',
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

async function renderHistory() {
    console.log("render history")
    try {
        // 1. Lấy tất cả dữ liệu
        const allTodos = await db.getAllTodos();
        
        // 2. Sắp xếp: Mới nhất lên đầu
        allTodos.sort((a, b) => b.id - a.id);

        // 3. Render HTML
        historyList.innerHTML = allTodos.map(t => {
            // Xác định loại
            const typeStr = t.hasReminder ? "Reminder" : "Note";
            
            return `
            <div class="note all ${t.isDone ? 'done' : ''}">
                <span>${t.todo}</span>
                
                <span class="note-info">Type: ${typeStr}</span>
                <span class="note-info">Created: ${formatTime(t.id)}</span>
                <span class="note-info">Done Time: ${t.isDone ? formatTime(t.doneTime) : 'Not yet'}</span>
            </div>
            `;
        }).join("");

    } catch (error) {
        console.error("Lỗi render history:", error);
    }
}

renderHistory()


// Gesture Effect
document.body.addEventListener('long-press', () => swipEffect.classList.remove('hidden'));
document.body.addEventListener('touchend', () => swipEffect.classList.add('hidden'));

// Navigation Logic
document.body.addEventListener("long-press-swipe", (e) => {
    const direction = e.detail.direction;

    // Đang ở màn hình nào?
    // const isInputShow = inputPage.classList.contains('show');
    // const isSettingsShow = settingsPage.classList.contains('show');
    // const isMainShow = mainPage.classList.contains('show');

    switch (direction) {
        case "up":

            inpTodo.value = ""; inpIsReminder.checked = false; inpDatetime.value = "";
            renderNotes()

            settingsPage.classList.remove("show")
            inputPage.classList.remove("show")
            historiesPage.classList.remove("show")
            mainPage.classList.add("show")

            break;

        case "down":
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            inpDatetime.value = now.toISOString().slice(0, 16);

            settingsPage.classList.remove("show")
            mainPage.classList.remove("show")
            historiesPage.classList.remove("show")
            inputPage.classList.add("show")
            break;

        case "right":
            mainPage.classList.remove("show")
            inputPage.classList.remove("show")
            historiesPage.classList.remove("show")
            settingsPage.classList.add("show")
            break;

        case "left":
            renderHistory()
            mainPage.classList.remove("show")
            inputPage.classList.remove("show")
            settingsPage.classList.remove("show")
            historiesPage.classList.add("show")
            break;
    }
});
