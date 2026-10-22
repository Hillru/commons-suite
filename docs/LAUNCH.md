# GitHub launch checklist and copy

Repository: https://github.com/Hillru/commons-suite (public). The project name has not undergone trademark clearance.

## Suggested repository description

Free, self-hosted productivity-suite alpha: collaborative documents, basic spreadsheets, presentations, and shared folders. Apache-2.0.

## Suggested first release title

v0.1.0-alpha.1 — An open workspace, ready for early feedback

## Release notes

Commons Suite brings collaborative writing, a small spreadsheet editor, a title/body presentation editor, and shared folders into one self-hosted application.

This developer preview includes persistent storage, workspace accounts, file permissions, document coediting, sheet/slide editing leases, content revisions, and limited DOCX/XLSX/PPTX conversion.

It is not production enterprise software or an Office replacement for complex files. Compatibility limitations and a known moderate upstream dependency advisory are documented. Try it with non-sensitive data and help us prioritize the next phase.

## Publish source and the first prerelease

```sh
gh auth login
git remote add origin https://github.com/Hillru/commons-suite.git
git push -u origin main
gh release create v0.1.0-alpha.1 --prerelease --title 'v0.1.0-alpha.1 — Developer preview' --notes-file docs/RELEASE_NOTES.md
```

The repository was created through GitHub's website. Source upload and release creation must each be verified separately; repository creation alone does not publish the suite.

## Before public announcement

- Ensure README limitations match the implementation and verification record.
- Enable private vulnerability reporting, issue discussions if desired, Dependabot, and branch protection after CI succeeds.
- Verify attribution, full Apache license, third-party license copies, inventory, and lockfile.
- Confirm no .env, database, original uploads, credentials, private screenshots, or node_modules are tracked.
- Validate Docker deployment on a Docker-equipped machine.
- Invite a small group of design partners. Ask for their top workflow and representative files they may legally share.

The user can help by providing three representative non-sensitive Office files for the next compatibility pass.
