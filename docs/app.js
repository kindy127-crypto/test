const DATA_BASE = "../data";

const SOURCE_META = {
    arxiv: { name: "arXiv", icon: "A" },
    hackernews: { name: "Hacker News", icon: "Y" },
    github: { name: "GitHub Trending", icon: "G" },
    "36kr": { name: "36Kr", icon: "3" },
};

let availableDates = [];
let currentDate = "";

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
        renderDay(data);
    } catch {
        content.innerHTML = '<div class="empty-state">当日暂无数据</div>';
        currentDate = dateStr;
    }

    updateNav();
}

function renderDay(data) {
    const content = document.getElementById("content");
    document.getElementById("current-date").textContent = data.date;

    const grouped = {};
    for (const item of data.items) {
        const src = item.source || "other";
        if (!grouped[src]) grouped[src] = [];
        grouped[src].push(item);
    }

    // 按固定顺序排列
    const order = ["arxiv", "hackernews", "github", "36kr"];
    const sources = order.filter(s => grouped[s]).concat(
        Object.keys(grouped).filter(s => !order.includes(s))
    );

    if (sources.length === 0) {
        content.innerHTML = '<div class="empty-state">当日暂无数据</div>';
        return;
    }

    let html = "";
    for (const src of sources) {
        const meta = SOURCE_META[src] || { name: src, icon: "?" };
        html += `<section class="source-section">`;
        html += `<div class="source-header">`;
        html += `<span class="source-icon ${src}">${meta.icon}</span>`;
        html += `<span class="source-name">${meta.name}</span>`;
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

async function init() {
    await loadDateIndex();
    if (availableDates.length > 0) {
        loadDay(availableDates[0]);
    } else {
        const today = new Date().toISOString().slice(0, 10);
        loadDay(today);
    }
}

init();
