# GitHub launch checklist and copy

Working repository name: commons-suite. Confirm the final namespace/name before publishing if a different name is desired. The project name has not undergone trademark clearance.

## Suggested repository description

Free, self-hosted productivity-suite alpha: collaborative documents, basic spreadsheets, presentations, and shared folders. Apache-2.0.

## Suggested first release title

v0.1.0-alpha.1 — An open workspace, ready for early feedback

## Release notes

Commons Suite brings collaborative writing, a small spreadsheet editor, a title/body presentation editor, and shared folders into one self-hosted application.

This developer preview includes persistent storage, workspace accounts, file permissions, document coediting, sheet/slide editing leases, content revisions, and limited DOCX/XLSX/PPTX conversion.

It is not production enterprise software or an Office replacement for complex files. Compatibility limitations and a known moderate upstream dependency advisory are documented. Try it with non-sensitive data and help us prioritize the next phase.

## Publish when account access is ready

```sh
gh auth login
gh repo create commons-suite --public --source=. --remote=origin --push
gh release create v0.1.0-alpha.1 --prerelease --title 'v0.1.0-alpha.1 — Developer preview' --notes-file docs/RELEASE_NOTES.md
```

These commands are instructions, not a claim that the repository or release already exists. If the repo is created through a connector, verify its URL, default branch, visibility, and uploaded files.

## Before public announcement

- Ensure README limitations match the implementation and verification record.
- Enable private vulnerability reporting, issue discussions if desired, Dependabot, and branch protection after CI succeeds.
- Verify attribution, full Apache license, third-party license copies, inventory, and lockfile.
- Confirm no .env, database, original uploads, credentials, private screenshots, or node_modules are tracked.
- Validate Docker deployment on a Docker-equipped machine.
- Invite a small group of design partners. Ask for their top workflow and representative files they may legally share.

The user can help by connecting GitHub, choosing a personal or organization namespace, and providing three representative non-sensitive Office files for the next compatibility pass.
