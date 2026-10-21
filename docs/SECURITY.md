# Security status

This is a developer alpha. Use synthetic or non-sensitive data in a private environment.

Implemented:

- Salted scrypt password hashes; HttpOnly, SameSite=Strict cookies; optional Secure cookies.
- Eight-hour server-side sessions; logout and password changes revoke authentication.
- Exact Origin enforcement for API mutations, request schemas, bounded bodies, rate limits, and security headers.
- Server-side authorization for every file, export, original, history, editing lease, and sharing operation.
- CRDT authentication, read-only enforcement, persisted edits, and connection invalidation on permission changes.
- Sanitized document HTML and protocol allowlists.
- ZIP preflight, bounded conversion subprocesses, timeouts, input/output limits, and concurrency cap.
- Optimistic revision checks, transactional history, append-only application audit events.

Not implemented:

- OIDC/SSO, MFA, account recovery UI, organization/group directory controls.
- OS-level import sandbox, malware scanning, strict total memory quotas, untrusted document rendering isolation.
- WebSocket message quotas, per-user storage quotas, CRDT growth limits, sustained adversarial load verification.
- Tamper-evident/externally retained audit logs, encryption-key management, automated retention policies.
- Independent penetration testing, formal privacy assessment, compliance certification, HA.

Do not expose this alpha directly to the public internet. Deploy behind a private access boundary and HTTPS for trials. The database includes originals, passwords hashes, sessions, audit metadata, and document content; protect volume permissions and encrypt host disks/backups. No end-to-end encryption is claimed.

## Known dependency advisory

The verified production dependency scan reports one underlying moderate advisory in sprintf-js (GHSA-hp3w-g68c-fv3c), surfaced through argparse and Mammoth (three npm findings). Mammoth's command-line help formatting dependency is affected; this application invokes its conversion API in a subprocess, not its CLI. This reduces expected exposure but is not a claim that the dependency is safe.

Track removal or an upstream fix before a production release. Do not “fix” this by blindly downgrading Mammoth to an ancient release. Current high/critical findings were resolved using a newer @fastify/static and tested image-size/uuid overrides. Rerun npm audit against the current lockfile before every release.

## Reporting

Do not put secrets or exploitable production details in a public issue. When the GitHub repository exists, enable private vulnerability reporting and document its link here. Until then, contact the repository maintainer through the project's established private channel. No security email address is invented.
