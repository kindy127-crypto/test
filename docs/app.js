const DATA_BASE = "./data";

const SOURCE_META = {
    arxiv: { name: "arXiv", icon: "A" },
    hackernews: { name: "Hacker News", icon: "Y" },
    github: { name: "GitHub Trending", icon: "G" },
    "36kr": { name: "36Kr", icon: "3" },
    tech_corps: { name: "Tech Corps", icon: "TC" },
};

let availableDates = [];
let currentDate = "";
let currentData = null; // 缓存当前日期的原始数据

// --- 关键词管理 ---
const KW_STORAGE_KEY = "techdaily_keywords";

function getUserKeywords() {
    try {
        return JSON.parse(localStorage.getItem(KW_STORAGE_KEY)) || [];
    } catch {
        return [];
    }
}

function setUserKeywords(kws) {
    localStorage.setItem(KW_STORAGE_KEY, JSON.stringify(kws));
    renderKwList();
    // 重新渲染当前数据
    if (currentData) renderDay(currentData);
}

function filterByKeywords(items) {
    const kws = getUserKeywords();
    if (kws.length === 0) return items;
    return items.filter(item => {
        const text = (item.title + " " + (item.summary || "")).toLowerCase();
        return kws.some(kw => text.includes(kw.toLowerCase()));
    });
}

function renderKwList() {
    const list = document.getElementById("kw-list");
    const kws = getUserKeywords();
    list.innerHTML = kws.map((kw, i) =>
        `<span class="kw-chip">${escHtml(kw)}<span class="kw-remove" data-idx="${i}">&times;</span></span>`
    ).join("");
}

function addKeyword(kw) {
    kw = kw.trim();
    if (!kw) return;
    const kws = getUserKeywords();
    if (kws.includes(kw)) return;
    kws.push(kw);
    setUserKeywords(kws);
}

function removeKeyword(idx) {
    const kws = getUserKeywords();
    kws.splice(idx, 1);
    setUserKeywords(kws);
}

function clearKeywords() {
    setUserKeywords([]);
}

// --- 数据加载与渲染 ---

async function loadDateIndex() {
    try {
        const resp = await fetch(`${DATA_BASE}/index.json`);
        const data = await resp.json();
        availableDates = data.dates || [];
    } catch {
        availableDates = [];
    }
}

async function loadDay(dateStr) {
    const content = document.getElementById("content");
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const resp = await fetch(`${DATA_BASE}/${dateStr}.json`);
        if (!resp.ok) throw new Error("not found");
        const data = await resp.json();
        currentDate = dateStr;
        currentData = data;
        renderDay(data);
    } catch {
        content.innerHTML = '<div class="empty-state">当日暂无数据</div>';
        currentDate = dateStr;
        currentData = null;
    }

    updateNav();
}

function renderDay(data) {
    const content = document.getElementById("content");
    document.getElementById("current-date").textContent = data.date;

    const filtered = filterByKeywords(data.items);

    const grouped = {};
    for (const item of filtered) {
        const src = item.source || "other";
        if (!grouped[src]) grouped[src] = [];
        grouped[src].push(item);
    }

    const order = ["arxiv", "hackernews", "github", "36kr", "tech_corps"];
    const sources = order.filter(s => grouped[s]).concat(
        Object.keys(grouped).filter(s => !order.includes(s))
    );

    if (sources.length === 0) {
        const kws = getUserKeywords();
        content.innerHTML = kws.length > 0
            ? '<div class="empty-state">当前关键词无匹配结果，试试调整关键词</div>'
            : '<div class="empty-state">当日暂无数据</div>';
        return;
    }

    let html = "";
    for (const src of sources) {
        const meta = SOURCE_META[src] || { name: src, icon: "?" };
        html += `<section class="source-section">`;
        html += `<div class="source-header">`;
        html += `<span class="source-icon ${src}">${meta.icon}</span>`;
        html += `<span class="source-name">${meta.name}</span>`;
        html += `<span class="source-count">${grouped[src].length}</span>`;
        html += `</div>`;

        for (const item of grouped[src]) {
            html += `<div class="item-card">`;
            html += `<div class="item-title"><a href="${escHtml(item.url)}" target="_blank" rel="noopener">${escHtml(item.title)}</a></div>`;
            if (item.summary) {
                html += `<div class="item-summary">${escHtml(item.summary)}</div>`;
            }
            if (item.tags && item.tags.length) {
                html += `<div class="item-meta">`;
                for (const tag of item.tags) {
                    html += `<span class="tag">${escHtml(tag)}</span>`;
                }
                html += `</div>`;
            }
            html += `</div>`;
        }

        html += `</section>`;
    }

    content.innerHTML = html;
}

function escHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function updateNav() {
    const idx = availableDates.indexOf(currentDate);
    document.getElementById("prev-day").disabled = idx < 0 || idx >= availableDates.length - 1;
    document.getElementById("next-day").disabled = idx <= 0;
}

// --- 事件绑定 ---

document.getElementById("prev-day").addEventListener("click", () => {
    const idx = availableDates.indexOf(currentDate);
    if (idx >= 0 && idx < availableDates.length - 1) {
        loadDay(availableDates[idx + 1]);
    }
});

document.getElementById("next-day").addEventListener("click", () => {
    const idx = availableDates.indexOf(currentDate);
    if (idx > 0) {
        loadDay(availableDates[idx - 1]);
    }
});

// 关键词面板
document.getElementById("kw-toggle").addEventListener("click", () => {
    document.getElementById("kw-panel").classList.toggle("hidden");
});

document.getElementById("kw-add").addEventListener("click", () => {
    const input = document.getElementById("kw-input");
    addKeyword(input.value);
    input.value = "";
});

document.getElementById("kw-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        addKeyword(e.target.value);
        e.target.value = "";
    }
});

document.getElementById("kw-list").addEventListener("click", (e) => {
    if (e.target.classList.contains("kw-remove")) {
        removeKeyword(parseInt(e.target.dataset.idx));
    }
});

document.getElementById("kw-clear").addEventListener("click", clearKeywords);

async function init() {
    renderKwList();
    await loadDateIndex();
    if (availableDates.length > 0) {
        loadDay(availableDates[0]);
    } else {
        const today = new Date().toISOString().slice(0, 10);
        loadDay(today);
    }
}

init();
