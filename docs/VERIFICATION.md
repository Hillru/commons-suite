# Verification record — 2026-10-21

Environment: macOS ARM64, Node.js 24.19.0. Tests run against synthetic accounts and temporary databases.

- Backend/conversion/durability tests: six test groups, including password hashing, formula correctness and bounded repeated dependencies, folder permissions, editing leases, revision conflicts, sanitization, DOCX/XLSX conversion, PPTX generation, API authorization, logout, and persistence after database reopen.
- TypeScript check and production frontend build.
- Browser checks: spreadsheet save/reopen/XLSX download, two-session live document synchronization/reopen, slide editing/slideshow, mobile layout, DOCX import/live document initialization/original download, viewer edit denial and revoked-download denial.
- Desktop and mobile screenshots visually inspected. The pictures show synthetic fixture files and accounts, not a live customer installation.
- License inventory and CycloneDX dependency inventory generated from the installed lockfile.
- Production dependency audit: zero high/critical findings; three moderate findings represent one sprintf-js advisory through argparse/Mammoth. See SECURITY.md.

## GitHub verification — 2026-10-22

The [first hosted Linux run](https://github.com/Hillru/commons-suite/actions/runs/39785184907) passed on source commit b36bf42306a7441a4cef9f3914c59e33d00527ce: six backend test groups, five browser scenarios, TypeScript, production build, dependency audit at the high-severity threshold, and license inventory generation. Subsequent launch-documentation changes do not alter the tested application code.

Not verified here:

- Docker build/deployment (Docker unavailable).
- Rendering fidelity in Microsoft Office/LibreOffice, broad real-world format round trips.
- Sustained load, adversarial WebSocket payloads, crash fault injection, independent security/accessibility audits, or a full operational backup restore drill.

No test result establishes production enterprise readiness or Office parity.
