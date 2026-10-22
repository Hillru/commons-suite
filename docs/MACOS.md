# Standalone Mac desktop preview

Status: implementation in development, not an App Store submission or a notarized public installer. Only call a build tested after its corresponding CI run passes. This remains an alpha with limited Office compatibility.

## What the app contains

A Swift AppKit window embeds macOS WebKit. A bundled, checksum-verified official Node.js 24.22.0 runtime starts the existing Fastify/SQLite service. Production dependencies and the built web interface are included. Users do not install Node/npm, start a terminal, use ChatGPT, or keep Safari open. Target: macOS 14+, Apple silicon; the build script also accepts `COMMONS_ARCH=x64`, but Intel requires separate testing before distribution.

The first run asks for an email and a new password (12–256 characters), then shows the normal sign-in screen. No default shared account or existing demo credentials ship in the bundle. Passwords use salted scrypt hashes. Optional **Commons Suite → Remember Sign-in in Keychain** stores the current session token in macOS Keychain, never the password. Sessions expire after eight hours; password changes/logout invalidate sessions. Remembering sign-in is off by default.

Files live in `~/Library/Application Support/Commons Suite/commons.sqlite`, outside the replaceable app bundle. The directory is owner-only. This is local access protection, not database encryption; use macOS FileVault for encryption at rest. Help → Show Workspace Folder locates the workspace. Quit the app before copying a workspace manually. Keep the SQLite file and any WAL/SHM files together when recovering from an unexpected shutdown.

Desktop mode binds two dynamically assigned loopback ports. A per-launch random capability, sent over stdin and set as an HttpOnly browser cookie, gates the local API. Session authentication, exact-origin checks, permissions, and collaboration tickets still apply. External web navigation is blocked in the app; explicit external links open in the default browser. The service receives no inherited development credentials or Node options. Closing stdin terminates it if its owning app disappears.

DOCX/XLSX imports use the existing bounded worker; native file and Save dialogs handle import/export. DOCX export preserves paragraph text, XLSX supports the documented grid/formula subset, and PPTX export creates simple slides. Existing compatibility limits in README still apply. No PPTX import, cloud sync, SSO, or full Office parity.

## Build and verify

Requires a complete Apple Command Line Tools SDK and Node 24 for development only:

```sh
npm ci
npm test
npm run check
npm run licenses
npm run build:macos
npm run test:desktop
```

The build is under `.tmp/desktop-build/arm64/Commons Suite.app`. A production-only dependency install uses the lockfile with lifecycle scripts disabled. Node's archive is checked against the version's official SHA-256 list. The build-info record includes the archive digest. Development builds receive an ad-hoc signature; that does not establish a public publisher identity or notarization.

The packaged-service integration test relocates the bundle to a path containing spaces, launches only its bundled runtime with a clean environment, creates a fresh workspace, checks unauthorized/local-origin requests, edits a document through its live collaboration connection, saves sheets and slides, exports DOCX/XLSX/PPTX, reimports DOCX/XLSX, restarts, and verifies a consistent pre-update backup. This test does not substitute for native-window, Keychain, and Save/Open dialog testing.

`.github/workflows/macos.yml` builds and tests on a clean Apple-silicon Mac runner. Its artifact is explicitly a non-notarized development build with seven-day retention. The Linux workflow separately runs the five browser workflows. Never label these artifacts App Store ready.

## Updates and recovery

There is no automatic updater. A future signed release is installed by quitting, replacing the app in Applications, and reopening. App Support data remains separate. On a version change, the service uses SQLite `VACUUM INTO` to take a consistent backup before writing the installed-version marker; it retains three backups. Schema migrations beyond version 1 are not yet implemented and must get migration/rollback tests before introduction. Backup files contain the same private data as the workspace.

The earlier repository `data/` workspace is not automatically migrated or overwritten. A migration tool with explicit selection, backup, and verification is a later milestone.

## Public release gate

1. Pass unit, type, browser, packaged-service, and native-window tests for the exact candidate. Verify first run, document typing/sync, spreadsheet/presentation saves, native import/export dialogs, restart, session expiry/logout, optional Keychain restoration, and version-change backup.
2. Test on a separate clean Mac without development tools. Test each architecture being advertised.
3. Install a valid **Developer ID Application** certificate with its private key in the release operator's Keychain. Enroll in Apple's Developer Program if needed. Do not send Apple passwords, private keys, or recovery codes in an issue or chat.
4. Sign nested Node executable with hardened runtime and the necessary JIT entitlement, then the app. Verify signatures. Submit the archive with `notarytool` using a stored Keychain profile, wait for **Accepted**, staple and validate the ticket, and run Gatekeeper assessment on the installed candidate.
5. Create and test a signed/notarized disk image, publish SHA-256 and truthful release notes, and attach it to a GitHub prerelease. Only then share a public installer.

`npm run release:macos` implements signing, notarization, stapling, disk-image creation and assessment, and stops if a requirement fails. It requires the tested app path plus `COMMONS_SIGN_IDENTITY` and `COMMONS_NOTARY_PROFILE`; it does not upload a GitHub release automatically. This path has not been exercised without a signing identity.

## Mac App Store roadmap

Direct Developer ID distribution is the first target. Mac App Store submission needs a separate sandboxed build, sandbox-compatible service architecture and entitlements, security-scoped file access, App Store signing/provisioning, privacy declarations and policy, accessibility and review testing, screenshots, support contact, and App Store Connect submission. Do not assume the current unsandboxed Node child-process design will be approved unchanged. Apple review determines acceptance. Keep the download free; developer membership/hosting can still cost money.

## Licenses

Commons Suite: Apache-2.0. Preserve LICENSE and NOTICE, mark changes, and retain applicable attribution. Bundles carry THIRD_PARTY_NOTICES and dependency license texts. Node's complete LICENSE (including embedded third-party terms) is copied from its official archive. Swift wrapper code is part of this repository's Apache-2.0 license; AppKit/WebKit/Security are system frameworks, not redistributed binaries. Dependencies selected under MIT/ISC/BSD/Apache and the documented permissive alternatives require preservation of notices; permissive licensing does not remove these obligations. Do not include user databases, `.env`, login notes, GitHub credentials, test accounts, or signing keys in an installer.
