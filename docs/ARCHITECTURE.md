# Architecture and decisions

## Current alpha

Browser React/TypeScript → same-origin Fastify API → SQLite WAL database.
Browser Yjs provider → authenticated Hocuspocus WebSocket process within the same Node server → durable Yjs state in SQLite.
Import API → bounded child process → Mammoth/ExcelJS → schema validation → native content and retained original.

The API serves the built browser assets. Authorization is enforced at every content, history, download, and mutation endpoint. Membership grants are file-specific with recursive folder inheritance. Parents must remain accessible. Only the owner can change grants or trash a file. Administrators can create users and read audit metadata; administration alone does not grant access to every file.

## Editing and durability

Documents use the Yjs state as the authority. Every accepted document change persists synchronously to SQLite; exports materialize the persisted CRDT state into sanitized HTML. Save export snapshot creates a version-history checkpoint. Initial imported document content seeds the CRDT on first open. Yjs updates are not interchangeable with browser HTML snapshots.

Sheets/slides use structured JSON, optimistic revisions, and a per-session lease. A write requires current edit permission, the expected revision, and a live lease. Conflicts return 409; another session holding a lease produces 423. Logout ends authentication immediately; leases expire naturally.

Permission changes disconnect all collaboration sockets; reconnect authentication rechecks current access. Read-only connections cannot apply document writes. Collaboration tickets expire after 60 seconds; an established session remains valid until expiration/logout/revocation. If a later reconnect cannot authenticate, reopen the document for a fresh ticket.

Single-process SQLite transactions protect revision creation and updates. No horizontally scaled guarantees are made. File “versions” are content versions, not metadata or permission versions.

## Differences from the initial proposal

1. SQLite replaces PostgreSQL for this developer alpha to eliminate installation prerequisites. It is a deployment shortcut, not the intended enterprise storage layer.
2. A bounded custom formula parser and HTML grid replace Univer for now. No proprietary Univer collaboration/import packages are used. The grid, accessibility, copy/paste, and calculation feature coverage need expansion.
3. A semantic title/body slide editor replaces a free-position Konva canvas in the first slice. Konva integration, images, shapes, and layout controls remain future work.
4. Local password authentication precedes OIDC. No organizational SSO is advertised as implemented.
5. Actual compatibility is narrower than the proposed MVP: formatting fidelity, PDF, images/tables in editors, and document revision restore remain deferred.

## Repository boundaries

Keep authorization and lifecycle operations separate from editor state. Future packages should expose EditorAdapter (load/snapshot/render), FormatAdapter (import/export/report), StorageAdapter, IdentityAdapter, and PermissionService contracts.

## Enterprise migration

- PostgreSQL: versioned SQL migrations, row-level locking for revisions/leases, integration tests with a real PostgreSQL instance; migrate users, grants, CRDT blobs, revisions, audit events, and originals atomically.
- Object storage: immutable blobs and signed downloads issued only after permission checks; store object identifiers, never user-supplied filesystem paths.
- OIDC: validate issuer/audience/state/nonce, use authorization code + PKCE, map stable subject identifiers, explicit account linking, group synchronization, session revocation.
- Scale: route a document to one collaboration owner; use brokered invalidation and shared leases before multiple API instances. Test failover and reconnect behavior.
- Workers: dedicated containers with no network, restricted filesystem, cgroup CPU/RAM quotas, seccomp, and bounded queues.

No feature may depend on a paid SaaS or proprietary license without a separately approved architecture change.
