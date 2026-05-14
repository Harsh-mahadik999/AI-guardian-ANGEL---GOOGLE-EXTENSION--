// ============================================================
//  Guardian AI – Background Service Worker  (Manifest V3)
//  AI Engine: OpenRouter or OpenAI Compatible
// ============================================================

const VERSION = "2.0.0";
const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL = 'gemini-2.0-flash';
const API_KEY_STORAGE_KEY = "guardian_gemini_api_key";

async function getApiKey() {
  return new Promise(resolve => {
    chrome.storage.local.get([API_KEY_STORAGE_KEY], r => {
      resolve(r[API_KEY_STORAGE_KEY] || "");
    });
  });
}
// ─── Stat counters (persisted in storage) ───────────────────
async function getStats() {
  return new Promise(resolve => {
    chrome.storage.local.get(["stats"], r => {
      resolve(r.stats || {
        adsBlocked: 0,
        trackersBlocked: 0,
        malwareBlocked: 0,
        pagesScanned: 0,
        threatsFound: 0,
        consentsRejected: 0,
        weeklyData: Array(7).fill(0),
        lastReset: Date.now()
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
  const day = new Date().getDay();
  if (key === "threatsFound") {
    stats.weeklyData[day] = (stats.weeklyData[day] || 0) + amount;
  }
  await saveStats(stats);
}

// ─── AI Helper ──────────────────────────────────────────────
async function callAI(systemPrompt, userContent, maxTokens = 800) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("No API key set. Please add your Gemini API key in the extension settings.");
  }

  const combinedPrompt = `${systemPrompt}\n\n${userContent}`;
  console.log(`[Guardian] 🤖 Calling AI API (${maxTokens} tokens)...`);

  const res = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "user", content: combinedPrompt }
      ],
      temperature: 0.3,
      max_tokens: maxTokens
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errorMsg = err.error?.message || `API Error ${res.status}`;
    console.error(`[Guardian] ❌ API Error:`, errorMsg);
    if (res.status === 401 || res.status === 403 || errorMsg.includes('User not found')) {
      throw new Error('Invalid API key — please update your Gemini API key in the extension settings.');
    }
    throw new Error(errorMsg);
  }

  const data = await res.json();
  const result = data.choices?.[0]?.message?.content || "";
  console.log(`[Guardian] ✅ AI Response (${result.length} chars)`);
  return result;
}

// ─── Privacy Policy Analyzer ───────────────────────────────
async function analyzePrivacyPolicy(text, url, title) {
  const SYSTEM = `You are Guardian AI, a friendly but sharp privacy analyst. 
Your job: analyze privacy policies and terms of service with empathy and clarity.
Always respond with a valid JSON object — no markdown, no extra text.`;

  const USER = `Analyze this privacy policy from "${title}" (${url}).

Text (truncated): ${text.slice(0, 4000)}

Return EXACTLY this JSON:
{
  "summary": "2-3 warm, human sentences explaining what this policy means for the user",
  "bullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "risks": ["risk clause 1", "risk clause 2", "risk clause 3"],
  "riskScore": <0-100 integer>,
  "recommendation": "Safe | Moderate | Risky",
  "autoAcceptSafe": <true if score < 30 else false>,
  "humanVerdict": "One warm, conversational sentence telling the user what to do"
}`;

  const raw = await callAI(SYSTEM, USER, 800);
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return {
      summary: raw,
      bullets: [],
      risks: [],
      riskScore: 50,
      recommendation: "Moderate",
      autoAcceptSafe: false,
      humanVerdict: "I couldn't fully parse this policy — proceed with caution."
    };
  }
}

// ─── Payment Gateway Verifier ──────────────────────────────
async function verifyPaymentGateway(url, pageText) {
  const SYSTEM = `You are Guardian AI, a cybersecurity expert specializing in payment fraud. 
Be conversational, human, and protective. Return only valid JSON.`;

  const USER = `Analyze this checkout/payment page for legitimacy.
URL: ${url}
Page content snippet: ${pageText.slice(0, 2000)}

Return EXACTLY:
{
  "verdict": "Legit | Suspicious | High Risk",
  "score": <0-100, 100=most dangerous>,
  "ssl": <true/false>,
  "domainAge": "Unknown | New | Established",
  "flags": ["flag1", "flag2"],
  "humanMessage": "Friendly one-paragraph explanation for a non-tech user"
}`;

  const raw = await callAI(SYSTEM, USER, 500);
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return {
      verdict: "Suspicious",
      score: 60,
      ssl: url.startsWith("https"),
      domainAge: "Unknown",
      flags: ["Could not fully analyze page"],
      humanMessage: "I wasn't able to fully verify this payment page. Please be cautious."
    };
  }
}

// ─── Email Scam Detector ────────────────────────────────────
async function analyzeEmail(subject, sender, body) {
  const SYSTEM = `You are Guardian AI, an email security expert. 
You protect users from phishing and scams in a warm, calm tone. Return only valid JSON.`;

  const USER = `Analyze this email for scam/phishing signals.
Subject: ${subject}
From: ${sender}
Body (first 2000 chars): ${body.slice(0, 2000)}

Return EXACTLY:
{
  "trustScore": <0-100, 100=fully trusted>,
  "verdict": "Safe | Suspicious | Phishing",
  "redFlags": ["flag1", "flag2", "flag3"],
  "suspiciousLinks": ["link1", "link2"],
  "senderReputation": "Trusted | Unknown | Suspicious",
  "humanExplanation": "Warm 2-3 sentence explanation for user"
}`;

  const raw = await callAI(SYSTEM, USER, 500);
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return {
      trustScore: 40,
      verdict: "Suspicious",
      redFlags: ["Analysis failed — treat with caution"],
      suspiciousLinks: [],
      senderReputation: "Unknown",
      humanExplanation: "I couldn't fully analyze this email. Please be cautious before clicking any links."
    };
  }
}

// ─── General Page Scanner ──────────────────────────────────
async function scanPage(url, text, title) {
  const SYSTEM = `You are Guardian AI, a friendly website security scanner. 
Speak like a knowledgeable friend, not a robot. Return valid JSON only.`;

  const USER = `Scan this webpage for security and privacy concerns.
Page: "${title}" at ${url}
Content (first 3000 chars): ${text.slice(0, 3000)}

Return EXACTLY:
{
  "safetyScore": <0-100, 100=safest>,
  "category": "Safe | Moderate Risk | High Risk | Dangerous",
  "threats": ["threat1", "threat2"],
  "goodPoints": ["good1", "good2"],
  "humanSummary": "2-3 friendly sentences explaining the site's safety",
  "advice": "One actionable tip for the user"
}`;

  const raw = await callAI(SYSTEM, USER, 600);
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return {
      safetyScore: 50,
      category: "Moderate Risk",
      threats: [],
      goodPoints: [],
      humanSummary: raw.slice(0, 300),
      advice: "Proceed with standard caution."
    };
  }
}

// ─── Domain Reputation Quick Check ─────────────────────────
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

// ─── Message Router ────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handle = async () => {
    try {
      console.log(`[Guardian] 📨 Got message:`, msg.type);
      
      switch (msg.type) {

        case "ANALYZE_PRIVACY_POLICY":
          console.log(`[Guardian] 🔐 Starting privacy analysis...`);
          await incrementStat("pagesScanned");
          const policy = await analyzePrivacyPolicy(msg.text, msg.url, msg.pageTitle || msg.title || "Unknown");
          console.log(`[Guardian] ✅ Privacy analysis complete:`, policy);
          if (policy.riskScore > 60) await incrementStat("threatsFound");
          // Return in Gemini response format for consistency with popup parser
          const response = {
            candidates: [{
              content: {
                parts: [{ text: JSON.stringify(policy, null, 2) }]
              }
            }]
          };
          console.log(`[Guardian] 📤 Sending response to popup`);
          return response;

        case "VERIFY_PAYMENT":
          console.log(`[Guardian] 💳 Starting payment verification...`);
          const payment = await verifyPaymentGateway(msg.url, msg.text);
          console.log(`[Guardian] ✅ Payment verification complete:`, payment);
          if (payment.score > 50) await incrementStat("threatsFound");
          return payment;

        case "ANALYZE_EMAIL":
          console.log(`[Guardian] 📧 Starting email analysis...`);
          const email = await analyzeEmail(msg.subject, msg.sender, msg.body);
          console.log(`[Guardian] ✅ Email analysis complete:`, email);
          if (email.trustScore < 50) await incrementStat("threatsFound");
          return email;

        case "SCAN_PAGE":
          console.log(`[Guardian] 📄 Starting page scan...`);
          const key = await getApiKey();
          if (!key) {
            return { 
              error: "No API key found. Please set your Gemini API key in extension settings.",
              safetyScore: 0,
              category: "Unknown",
              threats: [],
              goodPoints: [],
              humanSummary: "Scan could not run — API key is missing.",
              advice: "Please add your Gemini API key in the extension settings."
            };
          }
          await incrementStat("pagesScanned");
          const scan = await scanPage(msg.url, msg.text, msg.title);
          const scanSummary = {
            url: msg.url,
            title: msg.title || 'Unknown Page',
            timestamp: Date.now(),
            general: scan,
            isPrivacy: false,
            isPayment: false,
            overallScore: scan.safetyScore || 50
          };
          await new Promise(resolve => chrome.storage.local.set({ currentPageScan: scanSummary }, resolve));
          console.log(`[Guardian] ✅ Page scan complete:`, scan);
          return scan;

        case "ANALYZE_PAGE":
          console.log(`[Guardian] 📋 Starting page analysis...`);
          await incrementStat("pagesScanned");
          const pageAnalysis = await analyzePrivacyPolicy(msg.text, msg.url, msg.pageTitle || "Unknown Page");
          console.log(`[Guardian] ✅ Page analysis complete:`, pageAnalysis);
          if (pageAnalysis.riskScore > 60) await incrementStat("threatsFound");
          return { candidates: [{ content: { parts: [{ text: JSON.stringify(pageAnalysis, null, 2) }] } }] };

        case "GET_STATS":
          const stats = await getStats();
          console.log(`[Guardian] 📊 Returning stats:`, stats);
          return stats;

        case "RESET_STATS":
          console.log(`[Guardian] 🔄 Resetting stats...`);
          const fresh = {
            adsBlocked: 0, trackersBlocked: 0, malwareBlocked: 0,
            pagesScanned: 0, threatsFound: 0, consentsRejected: 0,
            weeklyData: Array(7).fill(0), lastReset: Date.now()
          };
          await saveStats(fresh);
          console.log(`[Guardian] ✅ Stats reset`);
          return fresh;

        case "GET_CURRENT_SCAN":
          console.log(`[Guardian] 📋 Getting current page scan...`);
          const currentScan = await new Promise(resolve => {
            chrome.storage.local.get(['currentPageScan'], r => resolve(r.currentPageScan || null));
          });
          console.log(`[Guardian] ✅ Returning scan:`, currentScan);
          return currentScan;

        case "AUTO_SCAN_PAGE":
          console.log(`[Guardian] 🔄 Auto-scanning page:`, msg.title);
          try {
            // Analyze based on page type
            let privacy = null, payment = null;
            
            if (msg.isPrivacy) {
              privacy = await analyzePrivacyPolicy(msg.text, msg.url, msg.title);
              if (privacy.riskScore > 60) await incrementStat("threatsFound");
            }
            
            if (msg.isPayment) {
              payment = await verifyPaymentGateway(msg.url, msg.text);
              if (payment.score > 50) await incrementStat("threatsFound");
            }
            
            // Always do general scan
            const general = await scanPage(msg.url, msg.text, msg.title);
            await incrementStat("pagesScanned");
            
            const summary = {
              url: msg.url,
              title: msg.title,
              timestamp: Date.now(),
              privacy: privacy,
              payment: payment,
              general: general,
              isPrivacy: msg.isPrivacy,
              isPayment: msg.isPayment,
              overallScore: privacy ? (100 - privacy.riskScore) : (general?.safetyScore || 50)
            };
            
            // Store current page scan
            await new Promise(resolve => {
              chrome.storage.local.set({ currentPageScan: summary }, resolve);
            });
            
            console.log(`[Guardian] ✅ Auto-scan complete:`, summary);
            return summary;
          } catch (err) {
            console.error(`[Guardian] ❌ Auto-scan error:`, err.message);
            return { error: err.message };
          }

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
          await new Promise(r => chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: msg.key }, r));
          return { ok: true };

        case "CLEAR_API_KEY":
          await new Promise(r => chrome.storage.local.remove(API_KEY_STORAGE_KEY, r));
          return { ok: true };

        case "CHECK_API_KEY":
          const storedKey = await getApiKey();
          return {
            hasKey: !!storedKey,
            provider: "gemini",
            keySuffix: storedKey ? storedKey.slice(-4) : ""
          };

        default:
          console.log(`[Guardian] ⚠️ Unknown message type:`, msg.type);
          return { error: "Unknown message type" };
      }
    } catch (err) {
      console.error(`[Guardian] ❌ Error:`, err.message);
      return { error: err.message };
    }
  };

  handle().then(sendResponse);
  return true; // keep channel open for async
});

// ─── Weekly stats reset alarm ──────────────────────────────
chrome.alarms.create("weekly-reset", { periodInMinutes: 60 * 24 * 7 });
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === "weekly-reset") {
    const stats = await getStats();
    stats.weeklyData = Array(7).fill(0);
    stats.lastReset = Date.now();
    await saveStats(stats);
  }
});

// ─── Tab navigation tracking ───────────────────────────────
chrome.webNavigation.onCompleted.addListener(async details => {
  if (details.frameId !== 0) return;
  const rep = quickDomainRep(details.url);
  if (rep.score < 30) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "⚠️ Guardian AI Warning",
      message: `This page (${new URL(details.url).hostname}) looks suspicious. Stay safe!`
    });
  }
}, { url: [{ schemes: ["http", "https"] }] });

console.log(`Guardian AI v${VERSION} background worker active.`);
