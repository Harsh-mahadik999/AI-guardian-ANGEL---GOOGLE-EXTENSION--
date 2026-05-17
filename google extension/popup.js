// ============================================================
//  Guardian AI – Popup Script
// ============================================================

// ─── Helpers ────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function sendBg(msg) {
    return new Promise((res, rej) => {
        chrome.runtime.sendMessage(msg, r => {
            if (chrome.runtime.lastError) rej(chrome.runtime.lastError);
            else res(r);
        });
    });
}

const RESTRICTED_PREFIXES = [
    "chrome://",
    "chrome-extension://",
    "https://chrome.google.com/webstore",
    "edge://",
    "about:",
    "devtools://",
];

function isRestrictedUrl(url) {
    return !url || RESTRICTED_PREFIXES.some(prefix => url.startsWith(prefix));
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("NO_ACTIVE_TAB");
    if (isRestrictedUrl(tab.url)) throw new Error("RESTRICTED_PAGE");
    return tab;
}

async function sendContent(tabId, msg) {
    return new Promise((res, rej) => {
        chrome.tabs.sendMessage(tabId, msg, r => {
            if (chrome.runtime.lastError) rej(chrome.runtime.lastError);
            else res(r);
        });
    });
}

function showLoading(containerId, msg = "Guardian AI is thinking…") {
    $(containerId).innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <div class="loading-text">🤖 ${msg}</div>
    </div>`;
    $(containerId).classList.remove("hidden");
}

function scoreToColor(score, invert = false) {
    const s = invert ? 100 - score : score;
    if (s >= 75) return "#10b981";
    if (s >= 50) return "#f59e0b";
    return "#ef4444";
}

function buildRiskBar(score, label = "Risk Score") {
    const color = scoreToColor(score, true);
    const verdict = score < 30 ? "✅ Safe" : score < 60 ? "⚠️ Moderate" : "❌ Risky";
    return `
    <div class="risk-bar-wrap">
      <div class="risk-bar-header">
        <span style="font-size:12px;color:var(--text-muted)">${label}</span>
        <span class="risk-pill" style="background:${color}22;color:${color};border:1px solid ${color}55">${verdict}</span>
      </div>
      <div class="risk-bar-track">
        <div class="risk-bar-fill" style="width:${score}%;background:${color}"></div>
      </div>
      <div style="text-align:right;font-size:11px;color:var(--text-dim);margin-top:4px">${score}/100</div>
    </div>`;
}

function buildBullets(items, icon = "—") {
    if (!items?.length) return "";
    return `<ul class="bullet-list">${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
}

function buildTags(items, cls = "tag-amber") {
    if (!items?.length) return "";
    return `<div style="margin-top:8px">${items.map(t => `<span class="tag ${cls}">⚡ ${t}</span>`).join("")}</div>`;
}

function parseApiResponse(resp) {
    if (!resp) return resp;
    if (resp.candidates?.[0]?.content?.parts?.[0]?.text) {
        try {
            return JSON.parse(resp.candidates[0].content.parts[0].text.trim());
        } catch (e) {
            console.warn('API parse fallback failed:', e);
        }
    }
    if (typeof resp === 'string') {
        try {
            return JSON.parse(resp.trim());
        } catch (e) {
            console.warn('API parse fallback failed:', e);
        }
    }
    return resp;
}

function displayScanResult(result) {
    if (!result || result.error) {
        $("scan-result").innerHTML = `<div class="alert alert-warning"><span class="alert-icon">⚠️</span><span>${result?.error || 'Unable to load scan results.'}</span></div>`;
        $("scan-result").classList.remove("hidden");
        return;
    }

    const color = scoreToColor(result.safetyScore);
    $("scan-result").innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-size:28px">${result.safetyScore >= 70 ? "✅" : result.safetyScore >= 45 ? "⚠️" : "🚨"}</span>
        <div>
          <div style="font-weight:700;font-size:15px">${result.category}</div>
          <div style="font-size:11px;color:var(--text-dim)">AI Scan Complete</div>
        </div>
        <div style="margin-left:auto;font-size:26px;font-weight:900;color:${color}">${result.safetyScore}</div>
      </div>
      ${buildRiskBar(100 - result.safetyScore, "Risk Level")}
      <p style="font-size:13px;color:var(--text-muted);margin:10px 0;line-height:1.6">${result.humanSummary || ''}</p>
      ${result.threats?.length ? `<div style="margin-bottom:8px"><div class="card-title" style="margin-bottom:6px">⚠️ Threats Found</div>${buildTags(result.threats, "tag-red")}</div>` : ""}
      ${result.goodPoints?.length ? `<div><div class="card-title" style="margin-bottom:6px">✅ Good Signs</div>${buildTags(result.goodPoints, "tag-green")}</div>` : ""}
      ${result.advice ? `<div class="alert alert-info" style="margin-top:12px"><span class="alert-icon">💡</span><span>${result.advice}</span></div>` : ""}
    `;
    $("scan-result").classList.remove("hidden");
}

function renderLastScanCard(scan) {
    if (!scan || !scan.url) {
        $("last-scan-card").style.display = "none";
        return;
    }

    const score = scan.overallScore || scan.general?.safetyScore || 0;
    const verdict = score >= 70 ? "Safe" : score >= 40 ? "Moderate" : "High Risk";
    const badgeColor = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
    const date = new Date(scan.timestamp || Date.now()).toLocaleString();
    $("last-scan-title").textContent = scan.title || new URL(scan.url).hostname;
    $("last-scan-badge").textContent = `${verdict} • ${Math.round(score)}/100`;
    $("last-scan-badge").style.background = `${badgeColor}22`;
    $("last-scan-badge").style.color = badgeColor;
    $("last-scan-time").textContent = `Scanned on ${date}`;
    $("last-scan-summary").textContent = scan.general?.humanSummary || scan.summary || 'The latest scan summary will appear here.';
    $("last-scan-card").style.display = "block";
}

async function loadCurrentScan() {
    try {
        const current = await sendBg({ type: "GET_CURRENT_SCAN" });
        if (!current || current.error) {
            renderLastScanCard(null);
            return;
        }
        renderLastScanCard(current);
        const tab = await getActiveTab();
        if (current.url !== tab.url) return;
        const scan = current.general || current;
        if (!scan) return;
        displayScanResult(scan);
    } catch (_) {
        renderLastScanCard(null);
    }
}

// ─── Tab Routing ─────────────────────────────────────────────
const tabs = document.querySelectorAll(".nav-tab");
const panels = document.querySelectorAll(".panel");

tabs.forEach(tab => {
    tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        panels.forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        const panelId = `tab-${tab.dataset.tab}`;
        $(panelId)?.classList.add("active");
    });
});

$("go-settings")?.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    panels.forEach(p => p.classList.remove("active"));
    document.querySelector('[data-tab="settings"]')?.classList.add("active");
    $("tab-settings")?.classList.add("active");
});

// ─── Theme Toggle ────────────────────────────────────────────
let dark = true;
$("toggle-theme")?.addEventListener("click", () => {
    dark = !dark;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    $("toggle-theme").textContent = dark ? "🌙" : "☀️";
});

// ─── Setup Screen ────────────────────────────────────────────
async function checkSetup() {
    const { hasKey } = await sendBg({ type: "CHECK_API_KEY" });
    if (hasKey) {
        showMainApp();
    } else {
        $("setup-screen").classList.remove("hidden");
        $("main-app").classList.add("hidden");
    }
}

async function showMainApp() {
    $("setup-screen").classList.add("hidden");
    $("main-app").classList.remove("hidden");
    await loadStats();
    await loadPageInfo();
    await loadCurrentScan();
    await refreshApiKeyState();
}

$("setup-save")?.addEventListener("click", async () => {
    const key = $("setup-key").value.trim();
    if (!key.startsWith("AIza") || key.length < 30) {
        alert("Please enter a valid Google Gemini API key (starts with AIza…)");
        return;
    }
    $("setup-save").textContent = "Activating…";
    await sendBg({ type: "SAVE_API_KEY", key });
    await showMainApp();
});

$("setup-skip")?.addEventListener("click", showMainApp);

// ─── Load Page Info ───────────────────────────────────────────
async function loadPageInfo() {
    try {
        const tab = await getActiveTab();
        if (!tab?.url) return;
        const url = new URL(tab.url);
        $("page-url-display").textContent = url.hostname + url.pathname.slice(0, 30);

        // Domain reputation quick check
        const rep = await sendBg({ type: "DOMAIN_REP", url: tab.url });
        const badge = $("page-badge");
        const dot = $("page-dot");
        if (rep.rep === "trusted") {
            badge.textContent = "✅ Trusted";
            badge.style.cssText = "background:rgba(16,185,129,0.2);color:#10b981;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600;border:1px solid rgba(16,185,129,0.4)";
            dot.style.background = "#10b981";
        } else if (rep.rep === "unsecured") {
            badge.textContent = "⚠️ No HTTPS";
            badge.style.cssText = "background:rgba(245,158,11,0.2);color:#f59e0b;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600;border:1px solid rgba(245,158,11,0.4)";
            dot.style.background = "#f59e0b";
        } else {
            badge.textContent = "🔍 Unknown";
            badge.style.cssText = "background:rgba(99,102,241,0.2);color:#818cf8;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600;border:1px solid rgba(99,102,241,0.3)";
        }

        // Update payment-url-input with current URL
        if ($("payment-url-input")) $("payment-url-input").value = tab.url;

    } catch (_) { }
}

// ─── Load Stats & Dashboard ───────────────────────────────────
async function loadStats() {
    try {
        const stats = await sendBg({ type: "GET_STATS" });
        $("stat-ads").textContent = stats.adsBlocked || 0;
        $("stat-trackers").textContent = stats.trackersBlocked || 0;
        $("stat-threats").textContent = stats.threatsFound || 0;
        $("stat-pages").textContent = stats.pagesScanned || 0;
        $("stat-consent").textContent = stats.consentsRejected || 0;
        $("stat-malware").textContent = stats.malwareBlocked || 0;

        // Overall safety score
        const raw = stats.threatsFound || 0;
        const safeScore = Math.max(10, Math.min(100, 100 - raw * 3));
        updateScoreRing(safeScore);

        // Weekly chart
        buildWeeklyChart(stats.weeklyData || Array(7).fill(0));

        // AI coverage
        const { hasKey } = await sendBg({ type: "CHECK_API_KEY" });
        $("ai-coverage").textContent = hasKey ? "Active" : "No Key";
        $("ai-bar").style.width = hasKey ? "100%" : "0%";

        // Threat badge in tabs
        const tb = $("threat-badge");
        if (stats.threatsFound > 0) {
            tb.textContent = stats.threatsFound;
            tb.classList.remove("hidden");
        }

    } catch (_) { }
}

function updateScoreRing(score) {
    $("dash-score").textContent = score;
    const path = $("score-ring-path");
    const circumference = 213.6;
    const offset = circumference - (score / 100) * circumference;
    const color = scoreToColor(score);
    path.setAttribute("stroke", color);
    path.style.strokeDashoffset = offset;

    let statusText, desc;
    if (score >= 80) { statusText = "🟢 Well Protected"; desc = "Your browsing looks safe. Guardian AI is actively monitoring threats."; }
    else if (score >= 60) { statusText = "🟡 Moderate Risk"; desc = "Some threats detected. Review warnings carefully before proceeding."; }
    else { statusText = "🔴 High Risk Detected"; desc = "Multiple threats found. Avoid entering sensitive info on suspicious sites."; }

    $("dash-status").textContent = statusText;
    $("dash-desc").textContent = desc;
}

function buildWeeklyChart(data) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const max = Math.max(...data, 1);
    $("week-chart").innerHTML = data.map((val, i) => `
    <div class="week-bar-wrap">
      <div class="week-bar" style="height:${Math.max(4, (val / max) * 50)}px" title="${val} threats"></div>
      <div class="week-day">${days[i]}</div>
    </div>
  `).join("");
}

$("reset-stats-btn")?.addEventListener("click", async () => {
    if (!confirm("Reset all statistics?")) return;
    await sendBg({ type: "RESET_STATS" });
    await loadStats();
});

// ─── Scanner Tab ──────────────────────────────────────────────
$("scan-page-btn")?.addEventListener("click", async () => {
    showLoading("scan-result", "Scanning page for threats and risks…");
    try {
        const tab = await getActiveTab();
        const content = await sendContent(tab.id, { type: "GET_PAGE_TEXT" });
        const result = await sendBg({
            type: "SCAN_PAGE",
            url: tab.url,
            text: content.text,
            title: content.title
        });

        if (result.error) throw new Error(result.error);
        displayScanResult(result);
        await loadStats();
        await loadCurrentScan();
    } catch (err) {
        $("scan-result").innerHTML = `<div class="alert alert-warning"><span class="alert-icon">⚠️</span><span>${err.message === "NO_API_KEY" ? "Set your API key in Settings to enable AI scanning." : "Error: " + err.message}</span></div>`;
        $("scan-result").classList.remove("hidden");
    }
});

$("highlight-links-btn")?.addEventListener("click", async () => {
    const tab = await getActiveTab();
    await sendContent(tab.id, { type: "HIGHLIGHT_LINKS" });
    $("highlight-links-btn").innerHTML = "<span>✅</span> Links Highlighted on Page";
    $("highlight-links-btn").style.borderColor = "var(--emerald)";
    $("highlight-links-btn").style.color = "var(--emerald)";
});

// ─── Privacy Tab ──────────────────────────────────────────────
async function displayPrivacyResult(result, containerId = "privacy-result") {
    if (result.error) {
        $(containerId).innerHTML = `<div class="alert alert-warning"><span class="alert-icon">⚠️</span><span>${result.error === "NO_API_KEY" ? "Set your API key in Settings first." : result.error}</span></div>`;
        $(containerId).classList.remove("hidden");
        return;
    }
    const color = scoreToColor(result.riskScore, true);
    $(containerId).innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-size:13px;color:var(--text-muted);line-height:1.6;margin-bottom:10px">${result.humanVerdict || result.summary || ""}</div>
      ${buildRiskBar(result.riskScore, "Privacy Risk Score")}
    </div>
    ${result.summary ? `<p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">${result.summary}</p>` : ""}
    ${result.bullets?.length ? `
      <div class="card-title" style="margin-bottom:6px">📋 Key Points</div>
      ${buildBullets(result.bullets)}` : ""}
    ${result.risks?.length ? `
      <div class="card-title" style="margin:10px 0 6px">☠️ Risk Clauses</div>
      ${buildTags(result.risks, "tag-red")}` : ""}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <span class="tag ${result.recommendation === 'Safe' ? 'tag-green' : result.recommendation === 'Risky' ? 'tag-red' : 'tag-amber'}">${result.recommendation === 'Safe' ? '✅' : result.recommendation === 'Risky' ? '❌' : '⚠️'} ${result.recommendation || 'Moderate'}</span>
      ${result.autoAcceptSafe ? '<span class="tag tag-green">🤝 Auto-Accept Safe</span>' : ""}
    </div>
  `;
    $(containerId).classList.remove("hidden");
}

$("analyze-policy-btn")?.addEventListener("click", async () => {
    showLoading("privacy-result", "Reading privacy policy… this may take a moment");
    try {
        const tab = await getActiveTab();
        const content = await sendContent(tab.id, { type: "GET_PAGE_TEXT" });
        const rawResult = await sendBg({
            type: "ANALYZE_PRIVACY_POLICY",
            text: content.text,
            url: tab.url,
            title: content.title
        });
        const result = parseApiResponse(rawResult);
        displayPrivacyResult(result);
    } catch (err) {
        $("privacy-result").innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span><span>${err.message}</span></div>`;
    }
});

$("analyze-pasted-btn")?.addEventListener("click", async () => {
    const text = $("policy-text").value.trim();
    if (!text) { alert("Please paste some policy text first."); return; }
    showLoading("privacy-result", "Analyzing pasted text…");
    try {
        const rawResult = await sendBg({
            type: "ANALYZE_PRIVACY_POLICY",
            text,
            url: "manual-paste",
            title: "Pasted Policy"
        });
        const result = parseApiResponse(rawResult);
        displayPrivacyResult(result);
    } catch (err) {
        $("privacy-result").innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span><span>${err.message}</span></div>`;
    }
});

// ─── Payment Tab ──────────────────────────────────────────────
function displayPaymentResult(result, containerId = "payment-result") {
    if (result.error) {
        $(containerId).innerHTML = `<div class="alert alert-warning"><span class="alert-icon">⚠️</span><span>${result.error}</span></div>`;
        return;
    }
    const icon = result.verdict === "Legit" ? "✅" : result.verdict === "High Risk" ? "🚨" : "⚠️";
    const cls = result.verdict === "Legit" ? "tag-green" : result.verdict === "High Risk" ? "tag-red" : "tag-amber";
    const alertCls = result.verdict === "Legit" ? "alert-success" : result.verdict === "High Risk" ? "alert-danger" : "alert-warning";
    $(containerId).innerHTML = `
    <div style="text-align:center;margin-bottom:14px">
      <div style="font-size:48px">${icon}</div>
      <div style="font-size:18px;font-weight:800;margin:6px 0"><span class="tag ${cls}" style="font-size:14px">${result.verdict}</span></div>
    </div>
    ${buildRiskBar(result.score, "Fraud Risk Score")}
    <div class="alert ${alertCls}" style="margin:10px 0">
      <span class="alert-icon">${icon}</span>
      <span>${result.humanMessage}</span>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <span class="tag ${result.ssl ? 'tag-green' : 'tag-red'}">${result.ssl ? '🔒 SSL Valid' : '🔓 No SSL'}</span>
      <span class="tag tag-blue">🕐 Domain: ${result.domainAge || 'Unknown'}</span>
    </div>
    ${result.flags?.length ? `<div><div class="card-title" style="margin-bottom:6px">🚩 Warning Flags</div>${buildTags(result.flags, "tag-red")}</div>` : ""}
  `;
    $(containerId).classList.remove("hidden");
}

$("verify-payment-btn")?.addEventListener("click", async () => {
    showLoading("payment-result", "Verifying payment gateway security…");
    try {
        const tab = await getActiveTab();
        const content = await sendContent(tab.id, { type: "GET_PAGE_TEXT" });
        const result = await sendBg({
            type: "VERIFY_PAYMENT",
            url: tab.url,
            text: content.text
        });
        displayPaymentResult(result);
    } catch (err) {
        $("payment-result").innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span><span>${err.message}</span></div>`;
    }
});

$("verify-url-btn")?.addEventListener("click", async () => {
    const url = $("payment-url-input").value.trim();
    if (!url) { alert("Enter a URL to verify."); return; }
    showLoading("payment-result", "Analyzing payment URL…");
    try {
        const result = await sendBg({ type: "VERIFY_PAYMENT", url, text: "" });
        displayPaymentResult(result);
    } catch (err) {
        $("payment-result").innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span><span>${err.message}</span></div>`;
    }
});

// ─── Email Tab ────────────────────────────────────────────────
$("analyze-email-btn")?.addEventListener("click", async () => {
    const subject = $("email-subject").value.trim();
    const sender = $("email-sender").value.trim();
    const body = $("email-body").value.trim();
    if (!body) { alert("Please paste at least the email body."); return; }
    showLoading("email-result", "Analyzing email for scam patterns…");
    try {
        const result = await sendBg({
            type: "ANALYZE_EMAIL",
            subject: subject || "Unknown Subject",
            sender: sender || "Unknown Sender",
            body
        });
        if (result.error) throw new Error(result.error);
        const trustColor = scoreToColor(result.trustScore);
        const icon = result.verdict === "Safe" ? "✅" : result.verdict === "Phishing" ? "🎣" : "⚠️";
        const alertCls = result.verdict === "Safe" ? "alert-success" : result.verdict === "Phishing" ? "alert-danger" : "alert-warning";
        $("email-result").innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-size:32px">${icon}</span>
        <div>
          <div style="font-weight:700;font-size:15px">${result.verdict}</div>
          <div style="font-size:11px;color:var(--text-dim)">Trust Score: <span style="color:${trustColor};font-weight:700">${result.trustScore}/100</span></div>
        </div>
        <div style="margin-left:auto"><span class="tag tag-blue">📤 ${result.senderReputation || 'Unknown'}</span></div>
      </div>
      ${buildRiskBar(100 - result.trustScore, "Scam Risk")}
      <div class="alert ${alertCls}" style="margin:10px 0">
        <span class="alert-icon">${icon}</span>
        <span>${result.humanExplanation}</span>
      </div>
      ${result.redFlags?.length ? `<div><div class="card-title" style="margin-bottom:6px">🚩 Red Flags</div>${buildTags(result.redFlags, "tag-red")}</div>` : ""}
      ${result.suspiciousLinks?.length ? `<div style="margin-top:10px"><div class="card-title" style="margin-bottom:6px">🔗 Suspicious Links</div>${buildTags(result.suspiciousLinks, "tag-amber")}</div>` : ""}
    `;
        $("email-result").classList.remove("hidden");
    } catch (err) {
        $("email-result").innerHTML = `<div class="alert alert-danger"><span class="alert-icon">❌</span><span>${err.message}</span></div>`;
        $("email-result").classList.remove("hidden");
    }
});

// ─── Settings Logic ───────────────────────────────────────────
const SETTINGS_TOGGLES = ["adsEnabled", "trackersEnabled", "autoConsent", "paymentVerify", "autoPrivacy", "emailScan", "linkHighlight"];
const AI_AUTOMATION_TOGGLES = new Set(["paymentVerify", "autoPrivacy", "emailScan"]);

async function loadSettings() {
    return new Promise(resolve => {
        chrome.storage.sync.get(["privacyLevel", ...SETTINGS_TOGGLES], prefs => {
            // Privacy level
            if ($("privacy-level")) $("privacy-level").value = prefs.privacyLevel || "strict";
            // Toggles
            SETTINGS_TOGGLES.forEach(key => {
                const val = AI_AUTOMATION_TOGGLES.has(key) ? prefs[key] === true : prefs[key] !== false;
                const el = document.querySelector(`[data-key="${key}"]`);
                if (el) el.classList.toggle("on", val);
            });
            resolve(prefs);
        });
    });
}

async function refreshApiKeyState() {
    const keyState = await sendBg({ type: "CHECK_API_KEY" });
    if ($("settings-key")) {
        $("settings-key").placeholder = keyState.hasKey
            ? `AIza…${keyState.keySuffix} (saved)`
            : "AIza…";
    }
    if ($("ai-coverage")) $("ai-coverage").textContent = keyState.hasKey ? "Active (Gemini)" : "No Key";
    if ($("ai-bar")) $("ai-bar").style.width = keyState.hasKey ? "100%" : "0%";
}

async function saveSettings() {
    const prefs = {};
    prefs.privacyLevel = $("privacy-level")?.value || "strict";
    SETTINGS_TOGGLES.forEach(key => {
        const el = document.querySelector(`[data-key="${key}"]`);
        prefs[key] = el ? el.classList.contains("on") : !AI_AUTOMATION_TOGGLES.has(key);
    });
    await new Promise(r => chrome.storage.sync.set(prefs, r));
}

// Toggle clicks
document.querySelectorAll(".toggle-switch").forEach(sw => {
    sw.addEventListener("click", async () => {
        sw.classList.toggle("on");
        await saveSettings();
    });
});

// Privacy level change
$("privacy-level")?.addEventListener("change", saveSettings);

// Save API key
$("save-key-btn")?.addEventListener("click", async () => {
    const key = $("settings-key").value.trim();
    if (!key) { alert("Enter a Gemini API key."); return; }
    if (!key.startsWith("AIza") || key.length < 30) {
        alert("Invalid Gemini key (should start with AIza…)"); return;
    }
    await sendBg({ type: "SAVE_API_KEY", key });
    $("save-key-btn").innerHTML = "✅ Saved!";
    setTimeout(() => { $("save-key-btn").innerHTML = "💾 Save Key"; }, 2000);
    $("settings-key").value = "";
    $("settings-key").placeholder = "AIza…" + key.slice(-4) + " (saved)";
    $("ai-coverage").textContent = "Active (Gemini)";
    $("ai-bar").style.width = "100%";
});

// Clear key
$("clear-key-btn")?.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to clear your API key and reset all settings?")) return;
    await sendBg({ type: "CLEAR_API_KEY" });
    await new Promise(r => chrome.storage.sync.clear(r));
    await new Promise(r => chrome.storage.local.remove([
        "apiKey",
        "stats",
        "currentPageScan",
        "guardianPaused"
    ], r));
    location.reload();
});

// ─── Init ─────────────────────────────────────────────────────
(async () => {
    await checkSetup();
    await loadSettings();
})();
