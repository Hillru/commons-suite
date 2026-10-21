# Self-hosting and recovery

## Local installation

Node 24, npm ci, copy .env.example to .env, replace administrator email/password, npm run build, npm start. The bootstrap account is created only when the database has no users. Changing ADMIN_PASSWORD later does not reset an existing account. Use POST /api/password while signed in to change a password; it invalidates all that user's sessions.

Keep PUBLIC_ORIGIN exactly equal to the origin opened in the browser. The default is http://localhost:3000. HOST defaults to loopback. COOKIE_SECURE must be true when behind HTTPS; leave it false only for a local HTTP trial.

## Docker

docker compose up --build -d starts one container and a named data volume. Node runs as the non-root node user. Container filesystem is read-only except /app/data and /tmp. This protects runtime files but does not isolate an import worker's network or its access to the shared data directory. Docker execution has not been verified in the development environment because Docker is unavailable there.

For a remote pilot, terminate HTTPS at a reverse proxy. Route / to port 3000 and a separate WebSocket hostname/path to port 3001. Configure:

- PUBLIC_ORIGIN=https://workspace.example.org
- COLLAB_URL=wss://collaboration.example.org
- COOKIE_SECURE=true

Replace those example domains with yours. Forward WebSocket upgrade headers. Set proxy body limits to 8 MB, idle WebSocket timeouts appropriately, and rate limits for connection upgrades. Do not expose raw ports on a public interface.

## Backup / restore

Stop the server gracefully before copying data/commons.sqlite (or the entire Docker volume). A live copy of a WAL database requires a SQLite-aware backup operation; copying just the .sqlite file while running is unsafe.

1. Stop the application.
2. Copy the full data directory to protected backup storage, including any WAL/SHM files.
3. Restart the application and verify health/login.
4. For restoration, stop the target, restore to a separate directory, set DATA_DIR, start with the same app version, and verify representative content, originals, grants, and revisions.
5. Keep the previous database and app version until validation succeeds.

The automated durability test reopens a persisted database. A full operational Docker/backup recovery drill remains a pilot acceptance requirement.

## Upgrades

The alpha has schema version 1 and idempotent initial table creation. It does not yet have a general migration runner. Back up before any upgrade. Future schema changes must ship forward/backward compatibility notes and a tested migration. Never assume dropping an older binary onto a newer schema is safe.

## Operations

Health: GET /api/health. Audit: administrator-only GET /api/audit. Observe disk usage and application logs without logging secrets or document contents. Rotate backups, set disk limits, and plan maintenance windows. No uptime SLA is offered.
