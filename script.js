const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

// ======================================================
// 0. INDEXEDDB HANDLER
// ======================================================
const DB_NAME = 'TodoayDB';
const STORE_NAME = 'todos';
const DB_VERSION = 1;

const db = {
    open: () => {
        return new Promise((resolve, reject) => {
            if (navigator.storage && navigator.storage.persist) {
                navigator.storage.persist().then(granted => {
                    if (granted) console.log("Storage will not be cleared except by explicit user action");
                    else console.log("Storage may be cleared by the UA under storage pressure.");
                });
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };

            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    getAll: async () => {
        const database = await db.open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    add: async (todoItem) => {
        const database = await db.open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.add(todoItem);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    update: async (todoItem) => {
        const database = await db.open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(todoItem);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
};

// ======================================================
// 1. GESTURE LOGIC (LONG PRESS & SWIPE)
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
        const currentX = touch.clientX;
        const currentY = touch.clientY;

        const diffX = currentX - startX;
        const diffY = currentY - startY;

        if (!isLongPressActive) {
            if (Math.abs(diffX) > MOVE_TOLERANCE || Math.abs(diffY) > MOVE_TOLERANCE) {
                reset();
            }
            return;
        }

        if (isLongPressActive && !hasSwiped) {
            e.preventDefault();

            if (Math.abs(diffX) > SWIPE_THRESHOLD || Math.abs(diffY) > SWIPE_THRESHOLD) {
                let direction = "";
                if (Math.abs(diffX) > Math.abs(diffY)) {
                    direction = diffX > 0 ? "right" : "left";
                } else {
                    direction = diffY > 0 ? "down" : "up";
                }

                const event = new CustomEvent("long-press-swipe", {
                    bubbles: true,
                    detail: { direction: direction, originalEvent: e }
                });
                e.target.dispatchEvent(event);
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
const swipEffect = $('.hold-swip');

const inpTodo = $("#inp-todo");
const inpIsReminder = $('#is-reminder');
const inpDatetime = $('#inp-datetime');
const btnAddTodo = $("#btn-add-todo");

// ======================================================
// 3. HELPER FUNCTIONS
// ======================================================

function downloadICS(summary, startDate, endDate) {
    const formatDate = (date) => date.toISOString().replace(/-|:|\.\d+/g, '');
    const start = formatDate(startDate);
    const end = formatDate(endDate);

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//My PWA//VN
BEGIN:VEVENT
UID:${Date.now()}@mypwa
DTSTAMP:${start}
DTSTART:${start}
DTEND:${end}
SUMMARY:${summary}
DESCRIPTION:Tạo từ Todo PWA
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
        const allTodos = await db.getAll();
        
        allTodos.sort((a, b) => b.id - a.id);

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        // LOGIC FILTER QUAN TRỌNG:
        // 1. Chưa làm (isDone == false)
        // HOẶC
        // 2. Đã làm (isDone == true) NHƯNG thời gian hoàn thành (doneTime) >= 0h sáng hôm nay
        const filteredTodos = allTodos.filter(t => {
            if (!t.isDone) return true;
            return t.doneTime && t.doneTime >= startOfToday;
        });

        notes.innerHTML = filteredTodos.map((t) => {
            return `
            <div class="note${t.isDone ? " done" : ""}"
                ${!t.isDone
                    ? `onclick="toggleTodo(${t.id}, true)"`
                    : `ondblclick="toggleTodo(${t.id}, false)"`}
            >
                <span>${t.todo}</span>
            </div>
        `
        }).join("");

        if (filteredTodos.length === 0) {
            notes.innerHTML = `<div style="opacity: 0.5; font-style: italic;">All clear for today!</div>`;
        }

    } catch (error) {
        console.error("Lỗi render:", error);
    }
}

function closeInputPage() {
    inputPage.classList.remove("show");
    mainPage.classList.add("show");
    swipEffect.classList.add('hidden');
    
    inpTodo.value = "";
    inpIsReminder.checked = false;
    inpDatetime.value = "";
}

window.toggleTodo = async function (id, state) {
    try {
        const allTodos = await db.getAll();
        const todo = allTodos.find(t => t.id === id);
        
        if (todo) {
            todo.isDone = state;
            todo.doneTime = state ? Date.now() : null;
            
            await db.update(todo);
            renderNotes();
        }
    } catch (error) {
        console.error("Lỗi toggle:", error);
    }
}

// ======================================================
// 4. MAIN LOGIC & EVENT LISTENERS
// ======================================================

renderNotes();

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW Registered!', reg.scope))
            .catch(err => console.log('SW Registration failed', err));
    });
}

btnAddTodo.addEventListener('click', async () => {
    const content = inpTodo.value.trim();
    const isReminder = inpIsReminder.checked;
    const datetimeStr = inpDatetime.value;

    if (!content) {
        alert("Vui lòng nhập nội dung!");
        return;
    }

    let newTodo = {
        id: Date.now(),
        todo: content,
        isDone: false,
        doneTime: null,
        hasReminder: false
    };

    if (isReminder) {
        if (!datetimeStr) {
            alert("Please input datetime");
            return;
        }
        
        const startDate = new Date(datetimeStr);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
        downloadICS(content, startDate, endDate);
        
        newTodo.todo = `📅 ${content}`;
        newTodo.hasReminder = true;
        newTodo.reminderTime = startDate.toISOString();
    }

    // Lưu vào IndexedDB
    await db.add(newTodo);

    renderNotes();
    closeInputPage();
});

document.body.addEventListener('long-press', e => {
    swipEffect.classList.remove('hidden');
});

document.body.addEventListener('touchend', e => {
    swipEffect.classList.add('hidden');
});

document.body.addEventListener("long-press-swipe", (e) => {
    const direction = e.detail.direction;
    
    switch (direction) {
        case "up":
            closeInputPage();
            break;

        case "down":
            inputPage.classList.add("show");
            mainPage.classList.remove("show");
            swipEffect.classList.add('hidden');

            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            inpDatetime.value = now.toISOString().slice(0, 16);
            
            setTimeout(() => inpTodo.focus(), 100);
            break;
    }
});