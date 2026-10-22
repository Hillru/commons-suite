# Mac desktop preview validation — 22 October 2026

Candidate source: `6f9d4cb84969ff06e99ee83ae95ba104e7c358a6`. Version: `0.1.0-alpha.2`. Architecture tested: Apple silicon. Minimum declared macOS: 14. This is a development preview, not a notarized public release or an App Store submission.

## Automated evidence

- [Linux verification](https://github.com/Hillru/commons-suite/actions/runs/39823843838): seven backend tests, type checking, production build, five Chromium workflows, one WebKit workflow, dependency/license inventory, and the high-severity production audit gate passed.
- [Mac verification](https://github.com/Hillru/commons-suite/actions/runs/39823843888): seven backend tests, type checking, license inventory, native compilation and ad-hoc signature verification, packaged-service integration, and the WebKit workflow passed.
- The relocated packaged-service test covers first-run account creation; local capability and origin rejection; actual loopback bindings for both ports; document CRDT edits; spreadsheet/presentation saves; DOCX/XLSX/PPTX exports; DOCX/XLSX reimport with content/formula checks; restart persistence; SQLite backup integrity after a version change; and service exit when the owning app's input pipe closes.

The audit gate means no high/critical production advisories, not zero advisories. The existing three moderate entries trace to the documented sprintf-js/argparse/Mammoth CLI dependency chain; see SECURITY.md for the alpha's broader limitations.

## Native window observations on this Mac

A QA clone uses a separate bundle identifier, test workspace, and local ad-hoc signature. It does not use or modify the earlier personal workspace. No test database or credentials ship in the production bundle.

Verified through the actual AppKit/WebKit window:

- First-run setup form displays email, secure password, confirmation, and validation guidance.
- Existing synthetic account signs in; a document can be created, typed, and snapshotted.
- Quit/reopen preserves the document and its complete paragraph.
- Native DOCX export presents a Save dialog, writes a valid DOCX, and contains the exact expected paragraph when independently parsed.
- Native import presents an Open dialog and reimports that DOCX into the live editor with its paragraph intact.
- Optional Keychain storage and session restoration work: after a full quit/reopen, the app enters the workspace without re-entering credentials and displays both saved files.

The native window checks sampled document editing and the shared import/export path. Spreadsheet and presentation behavior was tested through the packaged service and WebKit workflow. This is not a clean-Mac installation test or validation of every macOS version.

## Release gates still open

No valid Apple signing identity was installed when checked. Developer ID signing, notarization, stapling, Gatekeeper assessment, disk-image installation on a separate clean Mac, and a public installer release remain unfinished. Intel distribution needs a separately tested build. The Mac App Store additionally needs its own sandbox-compatible architecture, provisioning, privacy/support materials, and review; see [MACOS.md](MACOS.md).

Do not promote the CI development artifact as a public installer. Existing permissions, import limits, format fidelity limits, and alpha security limitations remain in force. No full Office or enterprise readiness parity is claimed.
