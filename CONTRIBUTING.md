# Contributing to SparePage

Thanks for helping. SparePage is a small open-source project that finds print waste in documents
and fixes it. Bug reports, ideas, wording fixes and code are all welcome.

## Ground rules

These keep the promises on the privacy policy true:

- **No servers and no AI services.** Everything runs in the browser or add-in. Do not add code that
  sends document text anywhere.
- **Fixes only on request.** A document changes only when the person clicks Apply. A change that
  leaves out whole sentences is marked for review and is never part of Apply all.
- **Plain, honest copy.** No em-dashes in text people read, and no claims we cannot back up.
- **Keep it free of trackers.** No analytics, cookies or third-party requests from the website.

## Setting up

```bash
npm install
npm run typecheck && npm test
npm run build        # the Chrome extension, into dist/
npm run site:build   # the website scripts and the Word add-in manifest
npm run site:serve   # serve site/ at http://localhost:8123
```

Load `dist/` at `chrome://extensions` (Developer mode, Load unpacked). Setup for Google sign-in is in
[docs/SETUP.md](docs/SETUP.md), how the pieces fit is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
and the Word add-in is in [docs/ADDIN.md](docs/ADDIN.md).

## Sending a change

1. Open an issue first for anything large, so we can agree on the approach.
2. Keep a change focused, and add or update a test where there is logic.
3. Run the checks in the pull request template.

By contributing you agree your work is released under the [MIT licence](LICENSE).

Security problems: please follow [SECURITY.md](SECURITY.md) instead of opening an issue.
