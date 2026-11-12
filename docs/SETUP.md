# Developer setup

SparePage has no backend and needs no API keys. The only external setup is a Google Cloud
OAuth client so the extension can read and edit Google Docs.

## 1. Build and load

```bash
npm install
npm run build
```

Load `dist/` at `chrome://extensions` with Developer mode on ("Load unpacked"). Note the
extension ID Chrome shows.

The toolbar icon opens a demo document that works with no Google setup at all.

## 2. Google Cloud project (for live documents)

1. In <https://console.cloud.google.com>, create or pick a project.
2. **APIs & Services > Library**: enable **Google Docs API**. (The Drive API is not needed.)
3. **OAuth consent screen**: External. Add the scope
   `https://www.googleapis.com/auth/documents` and nothing else. While unverified, add each
   tester's Google account under **Test users** (100 max).
4. **Credentials > Create credentials > OAuth client ID > Chrome extension**, using the
   extension ID from step 1.
5. Build with that client ID:

   ```bash
   SPAREPAGE_OAUTH_CLIENT_ID=<your client id> npm run build
   ```

   Without the variable, the build uses the team's development client in
   `manifest.config.ts`, which only works for the extension ID it was registered with.

An unpacked extension's ID depends on the folder path, so each developer either registers
their own client or loads from the same path. The Chrome Web Store build gets its own
fixed ID, so a store build needs an OAuth client registered for that ID.

## 3. Check it works

- Open one of your Google Docs. The SparePage button appears in the editor's bottom-right
  corner. Click it, then **Connect to Google Docs**.
- Apply a fix: the document changes in Docs.
- The panel shows "N pages" when the exact count from Docs' PDF export works, or "About N
  pages (estimate)" when it falls back.
- Ctrl/Cmd+P shows the print check.
