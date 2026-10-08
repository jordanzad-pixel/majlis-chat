# Majlis v13 — local release

The local v13 ZIP adds security headers (`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, tighter CSP), disables API response caching, avoids serving directory paths, and disables HTML shell caching.

Three existing Node tests passed and JavaScript syntax checks passed. These are limited development checks, not a production security audit.

**Deployment status:** source archive remains local and has **not** been committed to GitHub. No public PWA URL is live. A production hosting and persistent database setup is still needed.
