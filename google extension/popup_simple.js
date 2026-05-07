// ============================================================
//  Guardian AI – Popup Controller
// ============================================================
const $ = id => document.getElementById(id);
const log = (...a) => console.log('[Guardian]', ...a);

// ─── Tab switching ────────────────────────────────────────
document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// ─── Restricted URL guard ─────────────────────────────────
const RESTRICTED_PREFIXES = [
    "chrome://",
    "chrome-extension://",
    "https://chrome.google.com/webstore",
    "https://chromewebstore.google.com/",
    "edge://",
    "about:",
    "devtools://",
];

const TAB_ERROR_MESSAGES = {
    NO_ACTIVE_TAB:   "No active tab found. Please open a webpage and try again.",
    RESTRICTED_PAGE: "Guardian AI can't run on this page — browser system pages and the Chrome Web Store are off-limits. Please navigate to a regular website.",
};

function isRestrictedUrl(url) {
    return !url || RESTRICTED_PREFIXES.some(prefix => url.startsWith(prefix));
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        const err = new Error(TAB_ERROR_MESSAGES.NO_ACTIVE_TAB);
        err.code = "NO_ACTIVE_TAB";
        throw err;
    }
    if (isRestrictedUrl(tab.url)) {
        const err = new Error(TAB_ERROR_MESSAGES.RESTRICTED_PAGE);
        err.code = "RESTRICTED_PAGE";
        throw err;
    }
    return tab;
}

// ─── On Load ──────────────────────────────────────────────
window.addEventListener('load', () => {
  loadAll();
  
  const pauseToggle = $('pauseToggle');
  if (pauseToggle) {
    chrome.storage.local.get(['guardianPaused'], res => {
      pauseToggle.checked = !!res.guardianPaused;
    });
    pauseToggle.addEventListener('change', (e) => {
      chrome.storage.local.set({ guardianPaused: e.target.checked });
    });
  }
});

async function loadAll() {
  loadStats();
  loadSummary();
}

// ─── Stats ────────────────────────────────────────────────
let weeklyChartInstance = null;
let actionsChartInstance = null;

function renderCharts(s) {
  if (typeof Chart === 'undefined') return;

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weeklyData = s.weeklyData || [0,0,0,0,0,0,0];

  if (weeklyChartInstance) {
    weeklyChartInstance.data.datasets[0].data = weeklyData;
    weeklyChartInstance.update();
  } else {
    const ctxWeekly = document.getElementById('weeklyChart');
    if (ctxWeekly) {
      weeklyChartInstance = new Chart(ctxWeekly, {
        type: 'line',
        data: {
          labels: days,
          datasets: [{
            label: 'Threats Blocked',
            data: weeklyData,
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139,92,246,0.2)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointBackgroundColor: '#ef4444',
            pointBorderColor: '#fff',
            pointRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: '#1e1e3a' }, ticks: { color: '#888', precision: 0 } },
            x: { grid: { display: false }, ticks: { color: '#888' } }
          }
        }
      });
    }
  }

  const pieData = [
    s.adsBlocked || 0,
    s.trackersBlocked || 0,
    s.consentsRejected || 0,
    s.threatsFound || 0
  ];

  // If all zeros, show placeholder data so chart is visible
  const hasData = pieData.some(v => v > 0);
  const displayData = hasData ? pieData : [1, 1, 1, 1];
  const displayColors = hasData
    ? ['#10b981', '#3b82f6', '#f59e0b', '#ef4444']
    : ['#1e1e3a', '#1e1e3a', '#1e1e3a', '#1e1e3a'];

  if (actionsChartInstance) {
    actionsChartInstance.data.datasets[0].data = displayData;
    actionsChartInstance.data.datasets[0].backgroundColor = displayColors;
    actionsChartInstance.update();
  } else {
    const ctxPie = document.getElementById('actionsPieChart');
    if (ctxPie) {
      actionsChartInstance = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
          labels: ['Ads', 'Trackers', 'Consents', 'Threats'],
          datasets: [{
            data: displayData,
            backgroundColor: displayColors,
            borderWidth: 2,
            borderColor: '#12122a',
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: '#bbb', font: { size: 11 }, boxWidth: 12, padding: 10 }
            }
          },
          cutout: '65%'
        }
      });
    }
  }
}

function loadStats() {
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, s => {
    if (!s) return;
    $('sAds').textContent = s.adsBlocked || 0;
    $('sTrack').textContent = s.trackersBlocked || 0;
    $('sThreats').textContent = s.threatsFound || 0;
    $('sPages').textContent = s.pagesScanned || 0;
    renderCharts(s);
  });
}

function resetStats() {
  if (!confirm('Reset all statistics?')) return;
  chrome.runtime.sendMessage({ type: 'RESET_STATS' }, () => { loadStats(); });
}

// ─── Current Page Summary ─────────────────────────────────
function loadSummary() {
  // Show idle state immediately, don't show loading spinner
  $('pageSummary').innerHTML = `<div style="color:#666;font-size:12px;">No scan yet. Click <b>"Scan This Page Now"</b> below or wait for auto-scan.</div>`;
  chrome.runtime.sendMessage({ type: 'GET_CURRENT_SCAN' }, scan => {
    if (chrome.runtime.lastError || !scan || scan.error) return;
    renderSummary(scan);
  });
}

function renderSummary(scan) {
  const el = $('pageSummary');
  if (!el) return;
  
  const score = Math.round(scan.overallScore || 50);
  const cls = score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red';

  let html = `<div class="summary-title">${escHtml(scan.title || 'Unknown Page')}</div>`;
  html += `<div class="score-row"><span class="score-badge score-${cls}">${score}/100 Safety</span></div>`;

  // General scan
  if (scan.general) {
    const g = scan.general;
    html += `<div class="summary-line">📊 <strong>${g.category || 'Unknown'}</strong></div>`;
    if (g.humanSummary) html += `<div class="summary-line">${escHtml(g.humanSummary)}</div>`;
    if (g.threats?.length) {
      html += `<div style="margin-top:6px;">`;
      g.threats.forEach(t => { html += `<div class="risk-item">${escHtml(t)}</div>`; });
      html += `</div>`;
    }
    if (g.goodPoints?.length) {
      g.goodPoints.forEach(p => { html += `<div class="bullet" style="color:#10b981;">${escHtml(p)}</div>`; });
    }
    if (g.advice) html += `<div class="summary-tip">💡 ${escHtml(g.advice)}</div>`;
  }

  // Privacy
  if (scan.privacy) {
    const p = scan.privacy;
    const pcls = p.riskScore < 30 ? 'green' : p.riskScore < 60 ? 'yellow' : 'red';
    html += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #1e1e3a;">`;
    html += `<div class="score-row">🔐 Privacy Risk: <span class="score-badge score-${pcls}">${p.riskScore}/100</span></div>`;
    if (p.bullets?.length) p.bullets.forEach(b => { html += `<div class="bullet">${escHtml(b)}</div>`; });
    if (p.risks?.length) p.risks.forEach(r => { html += `<div class="risk-item">${escHtml(r)}</div>`; });
    html += `</div>`;
  }

  // Payment
  if (scan.payment) {
    const pay = scan.payment;
    const vcls = pay.verdict?.includes('Legit') ? 'green' : pay.verdict?.includes('Suspicious') ? 'yellow' : 'red';
    html += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #1e1e3a;">`;
    html += `<div class="score-row">💳 Payment: <span class="score-badge score-${vcls}">${pay.verdict}</span></div>`;
    html += `<div class="detail-row"><strong>SSL:</strong> ${pay.ssl ? '✅ Secure' : '❌ Insecure'}</div>`;
    if (pay.humanMessage) html += `<div class="summary-line">${escHtml(pay.humanMessage)}</div>`;
    html += `</div>`;
  }

  el.innerHTML = html;
}

// ─── Scan Now (manual trigger) ────────────────────────────
async function scanNow() {
  $('pageSummary').innerHTML = `<div class="loading">Scanning with AI</div>`;
  try {
    const tab = await getActiveTab();
    const pageText = await getPageText(tab);
    
    log('📤 Manual scan:', tab.title, '(', pageText.length, 'chars )');
    
    chrome.runtime.sendMessage({
      type: 'AUTO_SCAN_PAGE',
      url: tab.url,
      title: tab.title,
      text: pageText,
      isPrivacy: true,   // always analyze privacy for manual scan
      isPayment: /checkout|payment|billing|cart|order/i.test(tab.url + ' ' + pageText.slice(0, 500))
    }, result => {
      log('📥 Scan result:', result);
      if (!result || result.error) {
        $('pageSummary').innerHTML = `<div style="color:#ef4444;">❌ ${result?.error || 'No response from background'}</div>`;
        return;
      }
      renderSummary(result);
      loadStats();
    });
  } catch (e) {
    log('❌', e);
    $('pageSummary').innerHTML = `<div style="color:#ef4444;">❌ ${e.message}</div>`;
  }
}

// ─── Privacy Analysis ─────────────────────────────────────
async function runPrivacy() {
  const btn = $('btnPrivacy');
  const res = $('privacyResults');
  btn.disabled = true; btn.textContent = '⏳ Analyzing...';
  res.innerHTML = '<div class="loading">AI analyzing privacy</div>';
  res.classList.add('show');
  
  try {
    const tab = await getActiveTab();
    const text = await getPageText(tab);
    
    chrome.runtime.sendMessage({
      type: 'ANALYZE_PRIVACY_POLICY',
      text, url: tab.url, pageTitle: tab.title
    }, resp => {
      btn.disabled = false; btn.textContent = '🔐 Analyze Privacy & Terms';
      
      if (!resp || resp.error) {
        res.innerHTML = `<div style="color:#ef4444;">❌ ${resp?.error || 'No response'}</div>`;
        return;
      }
      
      // Parse response (may be wrapped in candidates format)
      let data = resp;
      try {
        if (resp.candidates?.[0]?.content?.parts?.[0]?.text) {
          data = JSON.parse(resp.candidates[0].content.parts[0].text);
        } else if (typeof resp === 'string') {
          data = JSON.parse(resp);
        }
      } catch(e) { log('Parse fallback:', e); }
      
      const score = Math.min(100, Math.max(0, data.riskScore || 50));
      const cls = score < 30 ? 'green' : score < 60 ? 'yellow' : 'red';
      const barColor = score < 30 ? '#10b981' : score < 60 ? '#f59e0b' : '#ef4444';
      
      let html = `<div class="score-row">Risk Score: <span class="score-badge score-${cls}">${score}/100</span></div>`;
      html += `<div class="risk-bar-wrap"><div class="risk-bar" style="width:${score}%;background:${barColor}"></div></div>`;
      
      if (data.humanVerdict) html += `<div class="summary-line" style="margin:8px 0;">${escHtml(data.humanVerdict)}</div>`;
      if (data.bullets?.length) {
        html += `<div style="margin-top:8px;">`;
        data.bullets.forEach(b => { html += `<div class="bullet">${escHtml(b)}</div>`; });
        html += `</div>`;
      }
      if (data.risks?.length) {
        html += `<div style="margin-top:8px;">`;
        data.risks.forEach(r => { html += `<div class="risk-item">${escHtml(r)}</div>`; });
        html += `</div>`;
      }
      if (score < 30) {
        html += `<button class="btn btn-green" style="margin-top:10px;" onclick="autoAccept()">✅ Auto Accept (Safe Policy)</button>`;
      }
      
      res.innerHTML = html;
    });
  } catch (e) {
    btn.disabled = false; btn.textContent = '🔐 Analyze Privacy & Terms';
    res.innerHTML = `<div style="color:#ef4444;">❌ ${e.message}</div>`;
  }
}

// ─── Payment Verification ─────────────────────────────────
async function runPayment() {
  const btn = $('btnPayment');
  const res = $('paymentResults');
  btn.disabled = true; btn.textContent = '⏳ Verifying...';
  res.innerHTML = '<div class="loading">AI verifying payment</div>';
  res.classList.add('show');
  
  try {
    const tab = await getActiveTab();
    const text = await getPageText(tab);
    
    chrome.runtime.sendMessage({
      type: 'VERIFY_PAYMENT', text, url: tab.url
    }, resp => {
      btn.disabled = false; btn.textContent = '💳 Verify Payment Page';
      
      if (!resp || resp.error) {
        res.innerHTML = `<div style="color:#ef4444;">❌ ${resp?.error || 'No response'}</div>`;
        return;
      }
      
      let data = resp;
      try { if (typeof resp === 'string') data = JSON.parse(resp); } catch(e) {}
      
      const vcls = data.verdict?.includes('Legit') ? 'green' : data.verdict?.includes('Suspicious') ? 'yellow' : 'red';
      
      let html = `<div class="verdict"><span class="score-badge score-${vcls}" style="font-size:14px;padding:6px 14px;">${data.verdict || 'Unknown'}</span></div>`;
      html += `<div class="detail-row"><strong>SSL:</strong> ${data.ssl ? '✅ Secure' : '❌ Not Secure'}</div>`;
      html += `<div class="detail-row"><strong>Domain:</strong> ${data.domainAge || 'Unknown'}</div>`;
      if (data.flags?.length) {
        html += `<div style="margin-top:6px;">`;
        data.flags.forEach(f => { html += `<div class="risk-item">${escHtml(f)}</div>`; });
        html += `</div>`;
      }
      if (data.humanMessage) html += `<div class="summary-line" style="margin-top:8px;">${escHtml(data.humanMessage)}</div>`;
      
      res.innerHTML = html;
    });
  } catch (e) {
    btn.disabled = false; btn.textContent = '💳 Verify Payment Page';
    res.innerHTML = `<div style="color:#ef4444;">❌ ${e.message}</div>`;
  }
}

// ─── Email Analysis ───────────────────────────────────────
async function runEmail() {
  const btn = $('btnEmail');
  const res = $('emailResults');
  const text = $('emailInput').value.trim();
  
  if (!text || text.length < 20) {
    res.innerHTML = `<div style="color:#f59e0b;">⚠️ Paste email content above (at least a few sentences)</div>`;
    res.classList.add('show');
    return;
  }
  
  btn.disabled = true; btn.textContent = '⏳ Analyzing...';
  res.innerHTML = '<div class="loading">AI analyzing email</div>';
  res.classList.add('show');
  
  chrome.runtime.sendMessage({
    type: 'ANALYZE_EMAIL',
    subject: text.split('\n')[0] || 'Unknown',
    sender: 'unknown@unknown.com',
    body: text
  }, resp => {
    btn.disabled = false; btn.textContent = '📧 Analyze Email';
    
    if (!resp || resp.error) {
      res.innerHTML = `<div style="color:#ef4444;">❌ ${resp?.error || 'No response'}</div>`;
      return;
    }
    
    let data = resp;
    try { if (typeof resp === 'string') data = JSON.parse(resp); } catch(e) {}
    
    const cls = data.trustScore >= 70 ? 'green' : data.trustScore >= 40 ? 'yellow' : 'red';
    
    let html = `<div class="score-row">Trust Score: <span class="score-badge score-${cls}">${data.trustScore || 0}/100</span></div>`;
    html += `<div class="verdict"><span class="score-badge score-${cls}" style="font-size:14px;padding:6px 14px;">${data.verdict || 'Unknown'}</span></div>`;
    if (data.humanExplanation) html += `<div class="summary-line">${escHtml(data.humanExplanation)}</div>`;
    if (data.redFlags?.length) {
      html += `<div style="margin-top:6px;">`;
      data.redFlags.forEach(f => { html += `<div class="risk-item">${escHtml(f)}</div>`; });
      html += `</div>`;
    }
    html += `<div class="detail-row" style="margin-top:6px;"><strong>Sender Rep:</strong> ${data.senderReputation || 'Unknown'}</div>`;
    
    res.innerHTML = html;
  });
}

// ─── Auto Accept ──────────────────────────────────────────
async function autoAccept() {
  try {
    const [tab] = await getActiveTab();
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        const btns = document.querySelectorAll('button, a[role="button"], [type="submit"]');
        for (const b of btns) {
          const t = b.textContent.toLowerCase();
          if ((t.includes('accept') || t.includes('agree')) && !t.includes('reject')) {
            b.click(); return true;
          }
        }
      }
    });
  } catch(e) { 
    log('Auto-accept failed:', e);
    const res = $('privacyResults');
    if (res) {
      res.innerHTML = `<div style="color:#f59e0b;">⚠️ ${e.message}</div>`;
      res.classList.add('show'); 
  }
}
}

// ─── Helpers ──────────────────────────────────────────────
async function getPageText(tab) {
  const tabId = parseInt(tab.id, 10);
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { action: 'getPageContent' });
    if (resp?.content?.length > 50) return resp.content;
  } catch(e) { log('Content script unavailable, using scripting API'); }
  
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      function: () => document.body.innerText.substring(0, 8000)
    });
    return results[0]?.result || '';
  } catch(e) {
    log('Scripting API failed:', e);
    return '';
  }
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("scanBtn")?.addEventListener("click", scanNow);
  document.getElementById("refreshBtn")?.addEventListener("click", loadAll);
});