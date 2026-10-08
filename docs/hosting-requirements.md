# Majlis PWA hosting requirements

The complete application source must be uploaded before deploying this Dockerfile.

The app needs:
- Node.js 20+ and HTTPS at the public origin.
- A persistent writable volume mounted at /app/data. The current storage uses a local JSON file; ephemeral storage would lose user accounts and messages on redeploy.
- PORT=3000 (or a platform-assigned port).
- MAJLIS_DATA_FILE=/app/data/db.json.
- A single server instance while using local JSON storage; do not scale to multiple replicas.
- Regular backups and restore tests.
- Security review and end-to-end testing before inviting real users.

Avoid exposing credentials in the repository. A free plan that suspends instances or has no persistent disk is not suitable for real conversations without replacing the database.

This repository is not yet a deployable full application: server.js and the remaining web files have not been committed.
