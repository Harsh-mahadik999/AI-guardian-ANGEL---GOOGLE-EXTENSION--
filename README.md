# 🛡️ Guardian AI ANGEL

### Intelligent Privacy & Security Chrome Extension for AI + Web Browsing

Guardian AI ANGEL is a **privacy-first Chrome Extension** that protects users from digital threats such as:

* Data leaks on AI platforms
* Phishing and scam websites
* Unsafe payment gateways
* Tracking and cookie abuse
* Malicious emails

It acts as a **real-time security layer inside the browser**, combining rule-based detection with AI-powered analysis (OpenRouter GPT-4o Mini).

---

## 📌 Problem Statement

Modern web usage exposes users to:

* Hidden data collection in AI tools
* Fake payment pages and phishing attacks
* Aggressive tracking and consent abuse
* Scam emails and malicious links

Most browsers either:

* Don’t detect these issues in real time, or
* Over-block without context

---

## 🎯 Solution

Guardian AI ANGEL provides a **balanced security layer** that:

* Detects threats in real time
* Explains risks in human-readable format
* Gives safety scores (0–100)
* Suggests safe actions instead of blocking blindly

---

## ⚙️ Core Capabilities

### 🔐 1. AI Privacy Policy Analyzer

* Detects privacy/terms pages automatically
* AI summarizes policies into key points
* Risk scoring (0–100)
* Detects:

  * Data selling
  * Tracking mechanisms
  * Third-party sharing
* One-click **Auto-Accept (safe pages only)**

---

### 💳 2. Payment Gateway Verification

* SSL & domain safety checks
* Phishing pattern detection
* Trust scoring system:

  * Legit ✅
  * Suspicious ⚠️
  * High Risk ❌
* Clear explanation of security risks

---

### 🍪 3. Auto Consent Manager

* Detects cookie banners
* Rejects non-essential tracking cookies
* Preserves essential site functionality
* Privacy-first default behavior

---

### 📧 4. Email Scam Detection

* Detects phishing emails in Gmail
* Flags:

  * Fake sender domains
  * Suspicious links
  * Social engineering patterns
* Trust score + explanation output

---

### 🚫 5. Advanced Ad & Tracker Blocker

* Blocks ads and tracking scripts
* Prevents popups and malicious scripts
* Lightweight performance impact
* Real-time blocking statistics

---

### 📊 6. AI Risk Dashboard

* Overall browsing safety score (0–100)
* Tracks:

  * Ads blocked
  * Trackers blocked
  * Threats detected
  * Pages scanned
* Weekly safety insights

---

## 🧠 AI Engine

* **Model:** GPT-4o Mini (OpenRouter)
* **Use:** Risk analysis + summarization
* **Latency:** ~1–2 seconds
* **Mode:** Hybrid (AI + rule-based detection)

---

## 🏗️ System Architecture

```text id="arch1"
Browser Pages
     ↓
Content Scripts (monitoring layer)
     ↓
Background Service Worker (logic layer)
     ↓
AI Engine (OpenRouter GPT-4o Mini)
     ↓
Risk Scoring + Decision Engine
     ↓
Popup Dashboard UI
```

---

## 📂 Project Structure

```bash id="struct2"
AI-guardian-ANGEL/
│
├── manifest.json
├── background.js
├── content.js
├── ai/                  # AI analysis layer
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── assets/
└── README.md
```

---

## 🚀 Installation

### 1. Clone Repository

```bash id="inst1"
git clone https://github.com/Harsh-mahadik999/AI-guardian-ANGEL---GOOGLE-EXTENSION--.git
```

### 2. Load Extension

1. Open `chrome://extensions/`
2. Enable Developer Mode
3. Click “Load Unpacked”
4. Select project folder

---

## 🎮 How It Works

1. Detects sensitive pages (AI, payments, emails)
2. Extracts relevant page data
3. Runs rule-based + AI analysis
4. Generates:

   * Risk score
   * Explanation
   * Recommended action

---

## 📊 Example Outputs

### Privacy Policy

* Risk Score: 72/100
* Verdict: ⚠️ Moderate Risk
* Issue: Data sharing with third parties

---

### Payment Page

* Verdict: ❌ High Risk
* Issue: Suspicious domain + weak SSL

---

### Email

* Trust Score: 85/100
* Verdict: Safe
* No phishing indicators detected

---

## 🔒 Privacy Guarantee

* ❌ No external data storage
* ❌ No user tracking
* ❌ No analytics collection
* ✅ All processing is local or encrypted API calls

---

## ⚡ Performance

* Lightweight extension (~200KB)
* <100ms page overhead
* Real-time threat detection
* Minimal memory footprint

---

## 🚧 Future Scope

* ML-based phishing classifier
* Multi-browser support (Firefox, Edge)
* Real-time threat intelligence feed
* Mobile companion app
* Enterprise security dashboard

---

## 🤝 Contribution Guidelines

* Keep code modular and readable
* One feature per PR
* Add clear comments for logic-heavy code
* Test before submitting
* Follow Manifest V3 standards

---

## 🐛 Issues

Report bugs with:

* Steps to reproduce
* Screenshot (if possible)
* Expected vs actual behavior

---

## 👤 Author

**Harsh Mahadik**
Chrome Extension Developer | AI Safety Systems

---

## ⭐ Support

If you find this project useful:

* Star ⭐ the repo
* Share with others
* Contribute improvements

---

## 🧠 Final Note

Guardian AI ANGEL is designed as a **browser-native security intelligence layer**, combining:

* Real-time detection
* AI reasoning
* Privacy-first architecture

It is not just an extension—it is a **digital safety assistant for the modern web**.