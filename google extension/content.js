// ============================================================
//  Guardian AI – Content Script (FINAL STABLE)
// ============================================================

(function () {
  "use strict";

  // ─── Utility ──────────────────────────────────────────────
  function escapeHTML(str = "") {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function send(msg) {
    return new Promise((res, rej) => {
      chrome.runtime.sendMessage(msg, (r) => {
        if (chrome.runtime.lastError) rej(chrome.runtime.lastError);
        else res(r);
      });
    });
  }

  function getPageText(maxLen = 8000) {
    return (document.body?.innerText || "").slice(0, maxLen);
  }

  // ─── Privacy Detection ────────────────────────────────────
  const PRIVACY_KEYWORDS = [
    /privacy\s*policy/i,
    /terms\s*(of\s*service|and\s*conditions)/i,
    /cookie\s*policy/i,
    /gdpr/i,
    /ccpa/i,
  ];

  function isPrivacyPage() {
    const content = (location.href + document.title + (document.querySelector("h1,h2")?.textContent || "")).toLowerCase();
    return PRIVACY_KEYWORDS.some((rx) => rx.test(content));
  }

  // ─── Payment Detection ────────────────────────────────────
  const PAYMENT_KEYWORDS = [/checkout/i, /payment/i, /billing/i, /credit[- ]?card/i];

  function isPaymentPage() {
    const content = (location.href + (document.body?.innerText || "")).toLowerCase();
    return PAYMENT_KEYWORDS.some((rx) => rx.test(content));
  }

  // ─── Toast System ─────────────────────────────────────────
  let toastQueue = [];
  let toastShowing = false;

  function showToast(msg, type = "info", duration = 4000) {
    toastQueue.push({ msg, type, duration });
    if (!toastShowing) processToastQueue();
  }

  function processToastQueue() {
    if (!toastQueue.length) {
      toastShowing = false;
      return;
    }

    toastShowing = true;
    const { msg, type, duration } = toastQueue.shift();

    const toast = document.createElement("div");
    const colors = {
      info: "#4f46e5",
      success: "#10b981",
      warning: "#f59e0b",
      danger: "#ef4444",
    };

    toast.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:2147483647;
      background:${colors[type]}; color:#fff;
      padding:12px 20px; border-radius:12px;
      box-shadow:0 8px 32px rgba(0,0,0,0.4);
      font-size:14px;
    `;

    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
      processToastQueue();
    }, duration);
  }

  // ─── Payment Banner ───────────────────────────────────────
  function showPaymentBanner(result) {
    if (!result || result.verdict === "Legit") return;

    const banner = document.createElement("div");
    banner.style.cssText = `
      position:fixed; top:20px; left:50%; transform:translateX(-50%);
      background:#7f1d1d; color:white; padding:16px;
      border-radius:12px; z-index:999999;
    `;

    banner.innerHTML = `
      <b>⚠️ Payment Warning</b><br>
      ${escapeHTML(result.humanMessage || "Suspicious payment page detected")}
    `;

    document.body.appendChild(banner);
  }

  // ─── Gmail Scanner (Optimized) ────────────────────────────
  function initGmailScanner() {
    if (!location.hostname.includes("mail.google.com")) return;

    let lastScan = 0;

    const observer = new MutationObserver(() => {
      if (Date.now() - lastScan < 2000) return; // throttle

      const emailBody = document.querySelector(".ii.gt");
      if (!emailBody || emailBody.dataset.scanned) return;

      emailBody.dataset.scanned = "1";
      lastScan = Date.now();

      const subject = document.querySelector(".hP")?.textContent || "";
      const sender = document.querySelector(".gD")?.textContent || "";
      const body = emailBody.innerText || "";

      send({ type: "ANALYZE_EMAIL", subject, sender, body })
        .then((res) => {
          if (res?.verdict && res.verdict !== "Safe") {
            showToast("⚠️ Suspicious email detected", "warning");
          }
        })
        .catch(() => {});
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Link Highlighter (Improved) ──────────────────────────
  function highlightSuspiciousLinks() {
    document.querySelectorAll("a[href]").forEach((a) => {
      if (a.dataset.checked) return;
      a.dataset.checked = "1";

      try {
        const url = new URL(a.href);

        if (url.protocol !== "https:") {
          a.style.outline = "2px solid orange";
          a.title = "Non-secure link (HTTP)";
        }
      } catch {}
    });
  }

  // ─── Main Init ────────────────────────────────────────────
  async function init() {
    highlightSuspiciousLinks();
    initGmailScanner();

    setTimeout(async () => {
      try {
        const result = await send({
          type: "AUTO_SCAN_PAGE",
          url: location.href,
          title: document.title,
          text: getPageText(),
          isPrivacy: isPrivacyPage(),
          isPayment: isPaymentPage(),
        });

        if (result?.payment) showPaymentBanner(result.payment);

        if (result?.general?.safetyScore < 50) {
          showToast("⚠️ Risky page detected", "warning");
        }
      } catch (e) {
        console.log("Scan failed", e);
      }
    }, 1500);
  }

  // ─── Message Listener ─────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
    if (msg.type === "GET_PAGE_TEXT") {
      sendResponse({
        text: document.body?.innerText || "",
        title: document.title,
        url: location.href,
      });
    }

    if (msg.type === "HIGHLIGHT_LINKS") {
      highlightSuspiciousLinks();
      sendResponse({ ok: true });
    }

    return true; // ✅ important
  });

  // ─── Boot ────────────────────────────────────────────────
  function start() {
    chrome.storage.local.get(["guardianPaused"], (res) => {
      if (!res.guardianPaused) init();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
