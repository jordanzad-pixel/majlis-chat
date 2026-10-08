# Majlis v12 validation

The local v12 archive includes a Node 20+ server, a `GET /healthz` endpoint, and three automated tests. The tests cover request validation (400 malformed JSON, 413 oversized requests), persisted sessions across server restarts, and group membership restrictions.

Run locally after extracting the archive:

```sh
cd majlis-chat
npm test
npm start
```

**Important:** The complete source code is not yet committed to this GitHub repository. No public app URL has been deployed. Do not use real personal data until hosting, backup, and security checks are complete.
