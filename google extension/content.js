// ============================================================
//  Guardian AI – Content Script
//  Runs on every page for: consent management, page classification,
//  payment detection, Gmail scanning, overlay panel injection
// ============================================================

(function () {
    "use strict";
    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
}
    // ─── Utility ──────────────────────────────────────────────
    function send(msg) {
        return new Promise((res, rej) => {
            chrome.runtime.sendMessage(msg, r => {
                if (chrome.runtime.lastError) rej(chrome.runtime.lastError);
                else res(r);
            });
        });
    }

    function getPageText(maxLen = 8000) {
        return (document.body?.innerText || "").slice(0, maxLen);
    }

    function getAutomationPrefs() {
        return new Promise(resolve => {
            chrome.storage.sync.get(["autoPrivacy", "paymentVerify", "emailScan"], prefs => {
                resolve({
                    autoPrivacy: prefs.autoPrivacy === true,
                    paymentVerify: prefs.paymentVerify === true,
                    emailScan: prefs.emailScan === true
                });
            });
        });
    }

    function isSensitivePage() {
        const hostname = location.hostname.replace(/^www\./, "").toLowerCase();
        const sensitiveHosts = [
            "mail.google.com",
            "docs.google.com",
            "drive.google.com",
            "sheets.google.com",
            "accounts.google.com",
            "calendar.google.com"
        ];
        const sensitivePath = /account|bank|statement|medical|health/i;
        return sensitiveHosts.includes(hostname) || sensitivePath.test(location.href);
    }

    // ─── 1. Privacy Policy Auto-Detect ────────────────────────
    const PRIVACY_KEYWORDS = [
        /privacy\s*policy/i, /terms\s*(of\s*service|and\s*conditions)/i,
        /cookie\s*policy/i, /data\s*processing/i, /gdpr/i, /ccpa/i
    ];

    function isPrivacyPage() {
        const url = location.href.toLowerCase();
        const title = document.title.toLowerCase();
        const h1 = document.querySelector("h1,h2")?.textContent?.toLowerCase() || "";
        return PRIVACY_KEYWORDS.some(rx => rx.test(url) || rx.test(title) || rx.test(h1));
    }

    // ─── 2. Payment Page Detect ────────────────────────────────
    const PAYMENT_KEYWORDS = [
        /checkout/i, /payment/i, /billing/i, /credit[- ]?card/i,
        /order[- ]?summary/i, /secure[- ]?pay/i, /place[- ]?order/i
    ];

    function isPaymentPage() {
        const url = location.href.toLowerCase();
        const text = document.body?.innerText?.toLowerCase() || "";
        return PAYMENT_KEYWORDS.some(rx => rx.test(url) || rx.test(text));
    }

    // ─── 3. Cookie Consent Manager ─────────────────────────────
    const CONSENT_SELECTORS = [
        '[id*="cookie"]', '[class*="cookie"]',
        '[id*="consent"]', '[class*="consent"]',
        '[id*="gdpr"]', '[class*="gdpr"]',
        '[id*="banner"]', '[class*="banner"]',
        '[role="dialog"]', '.cc-window', '.CookieConsent',
        '#onetrust-banner-sdk', '.cookie-notice', '#cookie-law-info-bar',
        '[aria-label*="cookie"]', '[aria-label*="consent"]'
    ];

    const REJECT_PATTERNS = [
        /reject\s*(all)?/i, /decline\s*(all)?/i, /deny/i,
        /necessary\s*only/i, /essential\s*only/i, /no,?\s*thanks/i,
        /opt.?out/i, /manage\s*preferences/i
    ];
    const ACCEPT_PATTERNS = [
        /^accept\s*(all)?$/i, /^agree$/i, /^ok$/i, /^got\s*it$/i,
        /allow\s*(all|cookies)?/i, /^i\s*agree$/i
    ];

    let consentHandled = false;

    async function handleCookieConsent() {
        // Disabled to avoid errors - users can manage cookies manually
        if (consentHandled) return;
        consentHandled = true;
        // Cookie handling disabled in this version
    }

    // ─── 4. Floating Toast Notification ────────────────────────
    let toastQueue = [];
    let toastShowing = false;

    function showToast(msg, type = "info", duration = 4000) {
        toastQueue.push({ msg, type, duration });
        if (!toastShowing) processToastQueue();
    }

    function processToastQueue() {
        if (!toastQueue.length) { toastShowing = false; return; }
        toastShowing = true;
        const { msg, type, duration } = toastQueue.shift();

        const existing = document.getElementById("guardian-toast");
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.id = "guardian-toast";
        const colors = { info: "#4f46e5", success: "#10b981", warning: "#f59e0b", danger: "#ef4444" };
        toast.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:2147483647;
      background:${colors[type] || colors.info}; color:#fff;
      padding:12px 20px; border-radius:12px; font-size:14px;
      font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;
      box-shadow:0 8px 32px rgba(0,0,0,0.4); max-width:360px;
      transform:translateY(80px); opacity:0;
      transition:all 0.4s cubic-bezier(0.34,1.56,0.64,1);
      line-height:1.4; pointer-events:none;
    `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            toast.style.transform = "translateY(0)";
            toast.style.opacity = "1";
        });
        setTimeout(() => {
            toast.style.transform = "translateY(80px)";
            toast.style.opacity = "0";
            setTimeout(() => { toast.remove(); processToastQueue(); }, 400);
        }, duration);
    }

    // ─── 5. Inline Privacy Analysis Banner ─────────────────────
    async function showPrivacyBanner(result) {
        const old = document.getElementById("guardian-privacy-banner");
        if (old) old.remove();

        const score = result.riskScore || 50;
        const rec = result.recommendation || "Moderate";
        const color = rec === "Safe" ? "#10b981" : rec === "Risky" ? "#ef4444" : "#f59e0b";
        const icon = rec === "Safe" ? "✅" : rec === "Risky" ? "❌" : "⚠️";

        const banner = document.createElement("div");
        banner.id = "guardian-privacy-banner";
        banner.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:28px">${icon}</span>
          <div>
            <div style="font-weight:700;font-size:15px;color:#fff">Guardian AI – Privacy Analysis</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.7)">${new URL(location.href).hostname}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:24px;font-weight:900;color:${color}">${score}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.6)">Risk Score</div>
        </div>
        <button id="guardian-close-banner" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;margin-left:10px">✕</button>
      </div>
      <div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:4px;margin-bottom:12px">
        <div style="background:${color};width:${score}%;height:8px;border-radius:6px;transition:width 1s ease"></div>
      </div>
      <p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:rgba(255,255,255,0.9)">${escapeHTML(result.humanVerdict || result.summary || "")}</p>
      ${result.bullets?.length ? `<ul style="margin:0 0 10px;padding-left:18px;font-size:12px;color:rgba(255,255,255,0.8);line-height:1.8">${result.bullets.map(b => `<li>${escapeHTML(b)}</li>`).join("")}</ul>` : ""}
      ${result.risks?.length ? `<div style="background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);border-radius:8px;padding:8px 12px;margin-bottom:10px"><div style="font-size:12px;font-weight:600;color:#fca5a5;margin-bottom:4px">⚠️ Risk Clauses</div>${result.risks.map(r => `<div style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:3px">• ${escapeHTML(r)}</div>`).join("")}</div>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span style="background:${color}22;border:1px solid ${color}55;color:${color};padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">${icon} ${rec}</span>
        ${result.autoAcceptSafe ? `<button id="guardian-auto-accept" style="background:#10b981;border:none;color:#fff;padding:4px 14px;border-radius:20px;font-size:12px;cursor:pointer">✅ Auto Accept (Safe)</button>` : ""}
        <button id="guardian-dismiss-banner" style="background:rgba(255,255,255,0.1);border:none;color:rgba(255,255,255,0.7);padding:4px 12px;border-radius:20px;font-size:12px;cursor:pointer">Dismiss</button>
      </div>
    `;
        banner.style.cssText = `
      position:fixed; top:16px; right:16px; z-index:2147483646;
      background:linear-gradient(135deg,#1e1b4b,#312e81);
      border:1px solid rgba(99,102,241,0.4); border-radius:16px;
      padding:16px; width:380px; box-shadow:0 20px 60px rgba(0,0,0,0.5);
      font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;
      transform:translateX(420px); transition:transform 0.5s cubic-bezier(0.34,1.56,0.64,1);
    `;
        document.body.appendChild(banner);
        requestAnimationFrame(() => { banner.style.transform = "translateX(0)"; });

        document.getElementById("guardian-close-banner")?.addEventListener("click", () => {
            banner.style.transform = "translateX(420px)";
            setTimeout(() => banner.remove(), 500);
        });
        document.getElementById("guardian-dismiss-banner")?.addEventListener("click", () => {
            banner.style.transform = "translateX(420px)";
            setTimeout(() => banner.remove(), 500);
        });
        document.getElementById("guardian-auto-accept")?.addEventListener("click", () => {
            showToast("✅ Safe policy auto-accepted", "success");
            banner.style.transform = "translateX(420px)";
            setTimeout(() => banner.remove(), 500);
        });
    }

    // ─── 6. Payment Warning Banner ──────────────────────────────
    async function showPaymentBanner(result) {
        const old = document.getElementById("guardian-payment-banner");
        if (old) old.remove();
        if (result.verdict === "Legit") return; // Don't interrupt safe payments

        const dangerColor = result.verdict === "High Risk" ? "#ef4444" : "#f59e0b";
        const icon = result.verdict === "High Risk" ? "🚨" : "⚠️";

        const banner = document.createElement("div");
        banner.id = "guardian-payment-banner";
        banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <span style="font-size:32px">${icon}</span>
        <div>
          <div style="font-weight:700;font-size:15px;color:#fff">Payment Security Alert</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.6)">Guardian AI – ${result.verdict}</div>
        </div>
      </div>
      <p style="margin:0 0 10px;font-size:13px;color:rgba(255,255,255,0.9);line-height:1.5">${escapeHTML(result.humanMessage)}</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
        ${result.flags?.map(f => `<span style="background:rgba(239,68,68,0.2);color:#fca5a5;padding:3px 10px;border-radius:20px;font-size:11px">⚡ ${escapeHTML(f)}</span>`).join("") || ""}
      </div>
      <div style="display:flex;gap:8px">
        <div style="flex:1;background:rgba(0,0,0,0.3);border-radius:8px;padding:4px">
          <div style="background:${dangerColor};width:${result.score}%;height:6px;border-radius:6px"></div>
        </div>
        <span style="font-size:12px;color:rgba(255,255,255,0.6)">Risk: ${result.score}/100</span>
      </div>
      <button id="guardian-payment-dismiss" style="margin-top:12px;background:rgba(255,255,255,0.1);border:none;color:#fff;padding:6px 16px;border-radius:20px;font-size:12px;cursor:pointer;width:100%">I Understand, Proceed Anyway</button>
    `;
        banner.style.cssText = `
      position:fixed; top:16px; left:50%; transform:translateX(-50%) translateY(-120%);
      z-index:2147483646; background:linear-gradient(135deg,#450a0a,#7f1d1d);
      border:2px solid ${dangerColor}; border-radius:16px; padding:16px; width:400px;
      box-shadow:0 20px 60px rgba(239,68,68,0.4);
      font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;
      transition:transform 0.5s cubic-bezier(0.34,1.56,0.64,1);
    `;
        document.body.appendChild(banner);
        requestAnimationFrame(() => { banner.style.transform = "translateX(-50%) translateY(0)"; });

        document.getElementById("guardian-payment-dismiss")?.addEventListener("click", () => {
            banner.style.transform = "translateX(-50%) translateY(-120%)";
            setTimeout(() => banner.remove(), 500);
        });
    }

    // ─── 7. Gmail Integration ──────────────────────────────────
    let gmailObserver = null;

    function initGmailScanner() {
        if (!location.href.includes("mail.google.com")) return;

        gmailObserver = new MutationObserver(() => {
            const emailBody = document.querySelector(".ii.gt");
            if (!emailBody || emailBody.dataset.guardianScanned) return;
            emailBody.dataset.guardianScanned = "1";

            const subject = document.querySelector(".hP")?.textContent || "Unknown Subject";
            const senderEl = document.querySelector(".gD");
            const sender = senderEl?.getAttribute("email") || senderEl?.textContent || "Unknown Sender";
            const body = emailBody.innerText || "";

            send({ type: "ANALYZE_EMAIL", subject, sender, body })
                .then(result => {
                    if (!result || result.error) return;
                    injectGmailBadge(emailBody, result);
                }).catch(() => { });
        });

        gmailObserver.observe(document.body, { childList: true, subtree: true });
    }

    function injectGmailBadge(container, result) {
        const old = document.getElementById("guardian-gmail-badge");
        if (old) old.remove();

        const score = result.trustScore || 50;
        const isScam = result.verdict !== "Safe";
        const color = result.verdict === "Safe" ? "#10b981" : result.verdict === "Phishing" ? "#ef4444" : "#f59e0b";
        const icon = result.verdict === "Safe" ? "✅" : result.verdict === "Phishing" ? "🎣" : "⚠️";

        const badge = document.createElement("div");
        badge.id = "guardian-gmail-badge";
        badge.style.cssText = `
      background:linear-gradient(135deg,#1e1b4b,#0f172a);
      border:1px solid ${color}55; border-radius:12px; padding:12px 16px;
      margin-bottom:12px; font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;
    `;
        badge.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span>${icon}</span>
        <span style="font-weight:700;color:#fff;font-size:14px">Guardian AI Email Scan</span>
        <span style="margin-left:auto;background:${color}22;color:${color};padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">${result.verdict}</span>
        <span style="color:rgba(255,255,255,0.5);font-size:12px">Trust: ${score}/100</span>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.85);line-height:1.5">${escapeHTML(result.humanExplanation)}</p>
      ${result.redFlags?.length ? `<div style="font-size:11px;color:#fca5a5">${result.redFlags.map(f => `⚡ ${escapeHTML(f)}`).join(" &nbsp; ")}</div>` : ""}
    `;
        container.parentNode?.insertBefore(badge, container);
    }

    // ─── 8. Suspicious Link Highlighter ────────────────────────
    const SUSPICIOUS_TLDs = /\.(tk|ml|ga|cf|gq|xyz|top|click|link|work|loan|win|download|racing)$/i;
    const PHISHING_WORDS = /paypal|amazon|apple|microsoft|google|bank|secure|login|verify|update|account/i;

    function highlightSuspiciousLinks() {
        document.querySelectorAll("a[href]").forEach(a => {
            if (a.dataset.guardianChecked) return;
            a.dataset.guardianChecked = "1";
            try {
                const url = new URL(a.href);
                const hostname = url.hostname;
                let sus = false;
                if (SUSPICIOUS_TLDs.test(hostname)) sus = true;
                if (!a.href.startsWith("https") && a.href.startsWith("http")) sus = true;
                // Homograph check: link text mentions company but URL is different
                const linkText = a.textContent?.trim() || "";
                if (PHISHING_WORDS.test(linkText) && !hostname.includes(linkText.split(/\s/)[0].toLowerCase())) sus = true;

                if (sus) {
                    a.style.outline = "2px solid #f59e0b";
                    a.style.borderRadius = "2px";
                    a.title = "⚠️ Guardian AI: Suspicious link – " + hostname;
                }
            } catch (_) { }
        });
    }

    // ─── 9. Main Initialization ─────────────────────────────────
    async function init() {
        // Consent banners – check after DOM settles
        setTimeout(handleCookieConsent, 1500);
        setTimeout(handleCookieConsent, 4000); // Second pass for lazy banners

        // Link highlighting
        setTimeout(highlightSuspiciousLinks, 2000);

        const automationPrefs = await getAutomationPrefs();

        // Gmail email bodies are sensitive, so scanning requires explicit opt-in.
        if (automationPrefs.emailScan) {
            initGmailScanner();
        }

        // AUTO-SCAN: run only for explicitly enabled page categories.
        setTimeout(async () => {
            try {
                const url = location.href;
                const title = document.title;
                const privacyPage = isPrivacyPage();
                const shouldScanPrivacy = automationPrefs.autoPrivacy && privacyPage;
                const shouldScanPayment = automationPrefs.paymentVerify && isPaymentPage();

                if ((!shouldScanPrivacy && !shouldScanPayment) || isSensitivePage()) {
                    console.log('[Guardian] Auto-scan skipped: no opt-in category or sensitive page.');
                    return;
                }

                const pageText = getPageText(8000);

                console.log('[Guardian] 🔄 Auto-scanning:', title, '(privacy:', shouldScanPrivacy, 'payment:', shouldScanPayment, ')');

                const result = await send({
                    type: 'AUTO_SCAN_PAGE',
                    url: url,
                    title: title,
                    text: pageText,
                    isPrivacy: shouldScanPrivacy,
                    isPayment: shouldScanPayment
                });

                console.log('[Guardian] ✅ Auto-scan complete for:', title);

                // Show relevant inline banners on page
                if (result && !result.error) {
                    if (result.privacy) {
                        showToast('📋 Privacy policy analyzed – check extension for details', 'info', 3000);
                        showPrivacyBanner(result.privacy);
                    }
                    if (result.payment) {
                        showToast('💳 Payment page verified – check extension for details', 'info', 3000);
                        showPaymentBanner(result.payment);
                    }
                    if (!result.privacy && !result.payment && result.general) {
                        const score = result.general.safetyScore || 50;
                        if (score < 50) {
                            showToast('⚠️ This page has potential risks – check Guardian AI', 'warning', 3000);
                        } else {
                            showToast('🛡️ Page scanned – ' + (result.general.category || 'Safe'), 'success', 2000);
                        }
                    }
                }
            } catch (e) {
                console.log('[Guardian] ⚠️ Auto-scan failed:', e.message);
            }
        }, 2000);
    }

    // Listen for popup-triggered scan
    chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
        if (msg.action === "getPageContent" || msg.type === "GET_PAGE_TEXT") {
            const content = document.body?.innerText?.substring(0, 5000) || "";
            sendResponse({ content: content, text: content, title: document.title, url: location.href });
        }
        if (msg.type === "HIGHLIGHT_LINKS") {
            highlightSuspiciousLinks();
            sendResponse({ ok: true });
        }
    });

    function checkAndInit() {
        chrome.storage.local.get(['guardianPaused'], res => {
            if (res.guardianPaused) {
                console.log('[Guardian] ⏸️ Protection is paused. Skipping init.');
                return;
            }
            init();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", checkAndInit);
    } else {
        checkAndInit();
    }
})();
