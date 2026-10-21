# Phased delivery

## 0.1 — Developer preview

Implemented: four module shells and basic editors, persistent files, local accounts, member grants, inherited folder permissions, document coediting, spreadsheet/slide leases, history, limited conversion, responsive UI, tests, CI recipe, Docker recipe, license inventory.

Release gates: pass automated checks, review license texts and known advisory, verify clean archive excludes secrets, publish exact limitations. GitHub publication requires a connected account and a selected namespace.

## 0.2 — Private team pilot

- Add OIDC with a self-hosted identity provider example, account password UI, administrator account recovery procedure.
- Improve spreadsheet editing: keyboard navigation, paste ranges, formatting, additional formula coverage, large-file virtualization.
- Images/tables in documents; images/shapes/layout controls in slides.
- Atomic document snapshot restore, collaboration reconnect UX, presence indicators.
- PostgreSQL adapter/migration, S3-compatible blobs, worker network/filesystem isolation, quotas.
- Resolve the Mammoth dependency advisory; complete independent dependency/license review.
- Run a Docker deployment and recovery drill; benchmark 25 users / 10 simultaneous editors as a target, not an existing guarantee.

Acceptance: no permission bypass in negative tests; revoked editors disconnected; saved edits survive crash/restart tests; representative format fixtures reviewed; accessibility keyboard flows checked.

## 0.3 — Compatibility and collaboration

- Multi-user spreadsheets/slides with stable identifiers and tested conflict semantics.
- Expanded format fidelity, compatibility reports per object, OpenDocument/PDF evaluation.
- Redistributable real-world fixtures and independent Office/LibreOffice rendering comparisons.
- Comments, team/group roles, stronger sharing controls and expiry.

Acceptance: deterministic formula test corpus, multi-client convergence tests, published compatibility matrix and data-loss detection.

## 1.0 candidate — Enterprise readiness

- High availability with shared invalidation, collaboration ownership, shared leases, and fault injection.
- SSO/MFA enforcement via identity provider, SCIM evaluation, retention policies, audit export.
- Threat modeling and independent security review, accessibility audit, disaster recovery drills.
- Documented upgrade paths, maintained release branches, signed images/artifacts, provenance/SBOM.

Acceptance: measured scale targets, agreed recovery objectives demonstrated, critical/high findings remediated, operational owners identified.

## Market sequence

Start with small self-hosting teams whose daily work is simple documents and sheets. Recruit design partners who accept an alpha and provide redistributable compatibility samples. Publish a factual demo and public issue tracker. Expand claims only when implementation and tests support them. Optional paid hosting/support can fund development while the suite remains free and open source.

Effort estimates should follow pilot feedback and team staffing. There is no credible promise of full Office parity on a short timeline.
