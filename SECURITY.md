# Security Policy

## Supported Versions

This repository currently supports the latest main branch state of Guardian AI ANGEL.

## Reporting a Vulnerability

If you find a security issue, please report it through the repository issue tracker with enough detail to reproduce the problem safely.

Include:

- A short summary of the issue
- Steps to reproduce
- The affected files or features
- Any proof of concept, if safe to share

Do not post secrets, tokens, or personal data in a public report.

## Security Expectations for Contributors

- Do not commit API keys, cookies, session tokens, or other secrets.
- Prefer defensive defaults for browser automation, page scanning, and link handling.
- Validate any user-controlled content before rendering it in the popup or content script.
- Keep Chrome extension permissions as narrow as the feature allows.

## Notes for This Project

Guardian AI ANGEL is a browser extension that inspects page content, local stats, and scanning results. Security-sensitive changes should be reviewed with attention to:

- message passing between content scripts and the background worker
- handling of page text before it is sent for analysis
- storage of configuration data and API credentials
- any code that injects UI into arbitrary web pages