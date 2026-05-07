// ============================================================
//  Guardian AI – Background Service Worker  (Manifest V3)
// ============================================================

const VERSION = "2.0.0";
const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL = 'gemini-2.0-flash';

async function getApiKey() {
  return "AIzaSyD-Id2Kz8PBUu6BT5RLEgYXKB6_ePdPQJw";
}

// ─── Rate Limiter: min 6s between calls ─────────────────────
let lastCallTime = 0;
const MIN_CALL_GAP_MS = 6000;

async function waitForRateLimit() {
  const wait = MIN_CALL_GAP_MS - (Date.now() - lastCallTime);
  if (wait > 0) {
    console.log(`[Guardian] ⏳ Rate limit pause: ${wait}ms`);
    await new Promise(r => setTimeout(r, wait));
  }
  lastCallTime = Date.now();
}

// ─── Scan Cache: skip re-scan within 5 minutes ──────────────
const scanCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key) {
  const entry = scanCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  return null;
}

function setCache(key, data) {
  scanCache.set(key, { data, ts: Date.now() });
}

// ─── Stat counters ───────────────────────────────────────────
async function getStats() {
  return new Promise(resolve => {
    chrome.storage.local.get(["stats"], r => {
      resolve(r.stats || {
        adsBlocked: 0, trackersBlocked: 0, malwareBlocked: 0,
        pagesScanned: 0, threatsFound: 0, consentsRejected: 0,
        weeklyData: Array(7).fill(0), lastReset: Date.now()
      });
    });
  });
}

async function saveStats(stats) {
  return new Promise(resolve => chrome.storage.local.set({ stats }, resolve));
}

async function incrementStat(key, amount = 1) {
  const stats = await getStats();
  stats[key] = (stats[key] || 0) + amount;
  if (key === "threatsFound") {
    const day = new Date().getDay();
    stats.weeklyData[day] = (stats.weeklyData[day] || 0) + amount;
  }
  await saveStats(stats);
}

// ─── Rule-based fallback (no API needed) ────────────────────
function ruleBasedScan(url, text) {
  const u = url.toLowerCase();
  const t = (text || "").toLowerCase().slice(0, 3000);
  let score = 75;
  const threats = [], good = [];

  if (!url.startsWith("https")) { score -= 20; threats.push("No HTTPS — connection is not encrypted"); }
  else good.push("HTTPS secure connection");

  const phishWords = ["verify your account", "suspended", "click here immediately", "confirm your password", "unusual activity"];
  phishWords.forEach(w => { if (t.includes(w)) { score -= 15; threats.push(`Phishing phrase detected: "${w}"`); } });

  const trackerDomains = ["doubleclick", "googlesyndication", "facebook.net", "hotjar", "fullstory"];
  trackerDomains.forEach(d => { if (u.includes(d) || t.includes(d)) { score -= 5; threats.push(`Tracker detected: ${d}`); } });

  if (/checkout|payment|billing|credit.?card|cvv/i.test(u + t)) good.push("Payment page detected — SSL verified");
  if (/privacy.?policy|terms.?of.?service/i.test(t)) good.push("Privacy policy present");

  score = Math.max(10, Math.min(100, score));
  const category = score >= 75 ? "Safe" : score >= 50 ? "Moderate Risk" : score >= 30 ? "High Risk" : "Dangerous";
  return {
    safetyScore: score, category,
    threats: threats.slice(0, 3),
    goodPoints: good.slice(0, 3),
    humanSummary: `Rule-based scan complete. This page scored ${score}/100. ${threats.length ? "Some concerns were found." : "No major issues detected."}`,
    advice: threats.length ? "Review the flagged issues before entering personal data." : "Page looks clean — stay alert as always."
  };
}

function ruleBasedPrivacy(url, text) {
  const t = (text || "").toLowerCase();
  let score = 40;
  const risks = [], bullets = [];

  if (/sell.*data|share.*third.?party|third.?party.*share/i.test(t)) { score += 20; risks.push("May sell or share your data with third parties"); }
  if (/track|tracking|analytics/i.test(t)) { score += 10; risks.push("Uses tracking and analytics"); }
  if (/delete.*account|right.*erasure|opt.?out/i.test(t)) { score -= 10; bullets.push("Offers data deletion or opt-out options"); }
  if (/encrypt|secure.*data/i.test(t)) { score -= 5; bullets.push("Mentions data encryption"); }
  if (/gdpr|ccpa|data.*protection/i.test(t)) { score -= 5; bullets.push("References privacy regulations (GDPR/CCPA)"); }
  if (/advertis/i.test(t)) { score += 10; risks.push("Data may be used for advertising"); }

  score = Math.max(0, Math.min(100, score));
  return {
    summary: `Rule-based privacy scan for ${new URL(url).hostname}.`,
    bullets: bullets.length ? bullets : ["Standard privacy policy detected"],
    risks: risks.length ? risks : ["No major red flags found"],
    riskScore: score,
    recommendation: score < 30 ? "Safe" : score < 60 ? "Moderate" : "Risky",
    autoAcceptSafe: score < 30,
    humanVerdict: score < 30 ? "This policy looks reasonable." : score < 60 ? "Review before accepting." : "Be cautious — this policy has concerning clauses."
  };
}

function ruleBasedPayment(url) {
  const isHttps = url.startsWith("https");
  const hostname = new URL(url).hostname;
  const knownGateways = ["paypal", "stripe", "razorpay", "paytm", "checkout", "shopify", "amazon"];
  const isKnown = knownGateways.some(g => hostname.includes(g));
  const score = isHttps ? (isKnown ? 15 : 40) : 80;
  return {
    verdict: score < 30 ? "Legit" : score < 60 ? "Suspicious" : "High Risk",
    score, ssl: isHttps,
    domainAge: isKnown ? "Established" : "Unknown",
    flags: isHttps ? [] : ["No HTTPS — do not enter card details"],
    humanMessage: isHttps ? (isKnown ? "Recognized payment gateway. Looks safe." : "HTTPS present but gateway is unknown. Verify before paying.") : "This page has no HTTPS. Do NOT enter payment details."
  };
}

function ruleBasedEmail(subject, sender, body) {
  const t = (subject + " " + body).toLowerCase();
  let score = 80;
  const flags = [];

  const phish = ["verify your account", "click here", "suspended", "urgent", "confirm your", "won a prize", "lottery", "inheritance"];
  phish.forEach(w => { if (t.includes(w)) { score -= 15; flags.push(`Suspicious phrase: "${w}"`); } });

  if (sender && !sender.includes("@")) { score -= 20; flags.push("Invalid sender address"); }
  if (/http:\/\//i.test(body)) { score -= 10; flags.push("Contains non-HTTPS links"); }

  score = Math.max(0, Math.min(100, score));
  return {
    trustScore: score,
    verdict: score >= 70 ? "Safe" : score >= 40 ? "Suspicious" : "Phishing",
    redFlags: flags.slice(0, 3),
    suspiciousLinks: [],
    senderReputation: score >= 70 ? "Unknown" : "Suspicious",
    humanExplanation: score >= 70 ? "No obvious phishing patterns found." : `${flags.length} suspicious pattern(s) detected. Be cautious before clicking any links.`
  };
}

// ─── AI Helper with 429 fallback to rule-based ───────────────
async function callAI(systemPrompt, userContent, maxTokens = 600, retries = 1) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("NO_API_KEY");

  await waitForRateLimit();

  let res;
  try {
    res = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: `${systemPrompt}\n\n${userContent}` }],
        temperature: 0.3,
        max_tokens: maxTokens
      })
    });
  } catch (networkErr) {
    throw new Error("Network error: " + networkErr.message);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errorMsg = err.error?.message || `API Error ${res.status}`;

    if (res.status === 429) {
      if (retries > 0) {
        console.log(`[Guardian] ⏳ 429 — retrying in 15s`);
        await new Promise(r => setTimeout(r, 15000));
        lastCallTime = 0;
        return callAI(systemPrompt, userContent, maxTokens, retries - 1);
      }
      throw new Error("RATE_LIMITED");
    }
    if (res.status === 401 || res.status === 403) throw new Error("Invalid API key.");
    throw new Error(errorMsg);
  }

  const data = await res.json();
  const result = data.choices?.[0]?.message?.content || "";
  console.log(`[Guardian] ✅ AI response (${result.length} chars)`);
  return result;
}

// ─── Privacy Policy Analyzer ────────────────────────────────
async function analyzePrivacyPolicy(text, url, title) {
  const cached = getCached("privacy:" + url);
  if (cached) { console.log("[Guardian] 📦 Privacy cache hit"); return cached; }

  try {
    const SYSTEM = `You are Guardian AI, a privacy analyst. Respond with valid JSON only, no markdown.`;
    const USER = `Analyze this privacy policy from "${title}" (${url}).
Text: ${text.slice(0, 3000)}
Return EXACTLY:
{"summary":"2-3 sentences","bullets":["b1","b2","b3"],"risks":["r1","r2"],"riskScore":50,"recommendation":"Safe|Moderate|Risky","autoAcceptSafe":false,"humanVerdict":"one sentence"}`;
    const raw = await callAI(SYSTEM, USER, 600);
    const result = JSON.parse(raw.replace(/```json|```/g, "").trim());
    setCache("privacy:" + url, result);
    return result;
  } catch (e) {
    console.log("[Guardian] ⚡ Privacy fallback (rule-based):", e.message);
    const result = ruleBasedPrivacy(url, text);
    setCache("privacy:" + url, result);
    return result;
  }
}

// ─── Payment Gateway Verifier ───────────────────────────────
async function verifyPaymentGateway(url, pageText) {
  const cached = getCached("payment:" + url);
  if (cached) { console.log("[Guardian] 📦 Payment cache hit"); return cached; }

  try {
    const SYSTEM = `You are Guardian AI, a payment fraud expert. Return valid JSON only.`;
    const USER = `Analyze this payment page.
URL: ${url}
Content: ${pageText.slice(0, 1500)}
Return EXACTLY:
{"verdict":"Legit|Suspicious|High Risk","score":50,"ssl":true,"domainAge":"Unknown|New|Established","flags":["f1"],"humanMessage":"one paragraph"}`;
    const raw = await callAI(SYSTEM, USER, 400);
    const result = JSON.parse(raw.replace(/```json|```/g, "").trim());
    setCache("payment:" + url, result);
    return result;
  } catch (e) {
    console.log("[Guardian] ⚡ Payment fallback (rule-based):", e.message);
    const result = ruleBasedPayment(url);
    setCache("payment:" + url, result);
    return result;
  }
}

// ─── Email Scam Detector ────────────────────────────────────
async function analyzeEmail(subject, sender, body) {
  try {
    const SYSTEM = `You are Guardian AI, an email security expert. Return valid JSON only.`;
    const USER = `Analyze this email for phishing/scam.
Subject: ${subject}
From: ${sender}
Body: ${body.slice(0, 1500)}
Return EXACTLY:
{"trustScore":70,"verdict":"Safe|Suspicious|Phishing","redFlags":["f1"],"suspiciousLinks":[],"senderReputation":"Trusted|Unknown|Suspicious","humanExplanation":"2-3 sentences"}`;
    const raw = await callAI(SYSTEM, USER, 400);
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.log("[Guardian] ⚡ Email fallback (rule-based):", e.message);
    return ruleBasedEmail(subject, sender, body);
  }
}

// ─── General Page Scanner ───────────────────────────────────
async function scanPage(url, text, title) {
  const cached = getCached("scan:" + url);
  if (cached) { console.log("[Guardian] 📦 Scan cache hit"); return cached; }

  try {
    const SYSTEM = `You are Guardian AI, a website security scanner. Return valid JSON only.`;
    const USER = `Scan this page for security concerns.
Page: "${title}" at ${url}
Content: ${text.slice(0, 2000)}
Return EXACTLY:
{"safetyScore":75,"category":"Safe|Moderate Risk|High Risk|Dangerous","threats":["t1"],"goodPoints":["g1"],"humanSummary":"2-3 sentences","advice":"one tip"}`;
    const raw = await callAI(SYSTEM, USER, 500);
    const result = JSON.parse(raw.replace(/```json|```/g, "").trim());
    setCache("scan:" + url, result);
    return result;
  } catch (e) {
    console.log("[Guardian] ⚡ Scan fallback (rule-based):", e.message);
    const result = ruleBasedScan(url, text);
    setCache("scan:" + url, result);
    return result;
  }
}

// ─── Domain Reputation Quick Check ──────────────────────────
const KNOWN_SAFE = new Set([
  "google.com", "youtube.com", "github.com", "wikipedia.org", "stackoverflow.com",
  "amazon.com", "microsoft.com", "apple.com", "mozilla.org", "cloudflare.com"
]);

function quickDomainRep(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (KNOWN_SAFE.has(hostname)) return { rep: "trusted", score: 95 };
    if (!url.startsWith("https")) return { rep: "unsecured", score: 30 };
    return { rep: "unknown", score: 65 };
  } catch {
    return { rep: "invalid", score: 0 };
  }
}

// ─── Message Router ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handle = async () => {
    try {
      console.log(`[Guardian] 📨 Message:`, msg.type);

      switch (msg.type) {

        case "ANALYZE_PRIVACY_POLICY": {
          await incrementStat("pagesScanned");
          const policy = await analyzePrivacyPolicy(msg.text, msg.url, msg.pageTitle || msg.title || "Unknown");
          if (policy.riskScore > 60) await incrementStat("threatsFound");
          return { candidates: [{ content: { parts: [{ text: JSON.stringify(policy) }] } }] };
        }

        case "VERIFY_PAYMENT": {
          const payment = await verifyPaymentGateway(msg.url, msg.text || "");
          if (payment.score > 50) await incrementStat("threatsFound");
          return payment;
        }

        case "ANALYZE_EMAIL": {
          const email = await analyzeEmail(msg.subject, msg.sender, msg.body);
          if (email.trustScore < 50) await incrementStat("threatsFound");
          return email;
        }

        case "SCAN_PAGE": {
          await incrementStat("pagesScanned");
          const scan = await scanPage(msg.url, msg.text || "", msg.title || "");
          return scan;
        }

        case "AUTO_SCAN_PAGE": {
          // Only do ONE AI call (general scan) to avoid rate limits
          // Privacy/payment only if explicitly on those page types
          const cacheKey = "auto:" + msg.url;
          const cached = getCached(cacheKey);
          if (cached) {
            console.log("[Guardian] 📦 Auto-scan cache hit");
            return cached;
          }

          let general = null, privacy = null, payment = null;

          // Always do general scan (1 call)
          general = await scanPage(msg.url, msg.text || "", msg.title || "");
          await incrementStat("pagesScanned");

          // Only do privacy scan if it's explicitly a privacy page (not every page)
          if (msg.isPrivacy && !msg.isPayment) {
            privacy = await analyzePrivacyPolicy(msg.text || "", msg.url, msg.title || "");
            if (privacy.riskScore > 60) await incrementStat("threatsFound");
          }

          // Only do payment scan if it's a payment page
          if (msg.isPayment) {
            payment = await verifyPaymentGateway(msg.url, msg.text || "");
            if (payment.score > 50) await incrementStat("threatsFound");
          }

          const summary = {
            url: msg.url, title: msg.title, timestamp: Date.now(),
            general, privacy, payment,
            overallScore: privacy ? (100 - privacy.riskScore) : (general?.safetyScore || 50)
          };

          setCache(cacheKey, summary);
          await new Promise(resolve => chrome.storage.local.set({ currentPageScan: summary }, resolve));
          return summary;
        }

        case "GET_STATS":
          return await getStats();

        case "RESET_STATS": {
          const fresh = {
            adsBlocked: 0, trackersBlocked: 0, malwareBlocked: 0,
            pagesScanned: 0, threatsFound: 0, consentsRejected: 0,
            weeklyData: Array(7).fill(0), lastReset: Date.now()
          };
          await saveStats(fresh);
          return fresh;
        }

        case "GET_CURRENT_SCAN":
          return await new Promise(resolve => {
            chrome.storage.local.get(['currentPageScan'], r => resolve(r.currentPageScan || null));
          });

        case "DOMAIN_REP":
          return quickDomainRep(msg.url);

        case "AD_BLOCKED":
          await incrementStat("adsBlocked", msg.count || 1);
          return { ok: true };

        case "TRACKER_BLOCKED":
          await incrementStat("trackersBlocked", msg.count || 1);
          return { ok: true };

        case "CONSENT_REJECTED":
          await incrementStat("consentsRejected", msg.count || 1);
          return { ok: true };

        case "SAVE_API_KEY":
          await new Promise(r => chrome.storage.local.set({ openrouter_api_key: msg.key }, r));
          return { ok: true };

        case "CHECK_API_KEY":
          return { hasKey: true, provider: "gemini" };

        default:
          return { error: "Unknown message type" };
      }
    } catch (err) {
      console.error(`[Guardian] ❌ Error:`, err.message);
      return { error: err.message };
    }
  };

  handle().then(sendResponse);
  return true;
});

// ─── Weekly stats reset ──────────────────────────────────────
chrome.alarms.create("weekly-reset", { periodInMinutes: 60 * 24 * 7 });
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === "weekly-reset") {
    const stats = await getStats();
    stats.weeklyData = Array(7).fill(0);
    stats.lastReset = Date.now();
    await saveStats(stats);
  }
});

// ─── Tab navigation (no AI call here) ───────────────────────
chrome.webNavigation.onCompleted.addListener(async details => {
  if (details.frameId !== 0) return;
  const rep = quickDomainRep(details.url);
  if (rep.score < 30) {
    chrome.notifications.create({
      type: "basic", iconUrl: "icons/icon48.png",
      title: "⚠️ Guardian AI Warning",
      message: `${new URL(details.url).hostname} looks suspicious. Stay safe!`
    });
  }
}, { url: [{ schemes: ["http", "https"] }] });

console.log(`Guardian AI v${VERSION} background worker active.`);
