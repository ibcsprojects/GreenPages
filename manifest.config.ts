import { defineManifest } from '@crxjs/vite-plugin'

// The OAuth client is bound to one extension ID. Local unpacked builds use the dev client
// below; the Chrome Web Store assigns its own ID, so store builds pass the client registered
// for that ID: GREENPAGES_OAUTH_CLIENT_ID=... npm run build
const OAUTH_CLIENT_ID =
  process.env.GREENPAGES_OAUTH_CLIENT_ID ??
  '415665395282-ci25olqg8gn4qjcbljgiqi9mobo282c2.apps.googleusercontent.com'

// Manifest V3. crxjs reads this and emits dist/manifest.json with hashed asset paths.
export default defineManifest({
  manifest_version: 3,
  name: 'GreenPages: Eco Formatting for Docs',
  version: '0.2.0',
  description:
    'Spots print waste in Google Docs (highlights, big fonts, blank pages, wordy text) and fixes it in one click. Runs in your browser.',
  icons: {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
  action: {
    default_title: 'GreenPages',
    default_icon: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  oauth2: {
    client_id: OAUTH_CLIENT_ID,
    // documents: read the open doc and apply the fixes the user accepts. This is the only
    // Google scope. (The Drive scope used for exact page counts was removed: Drive scopes
    // are "restricted" and would require a paid annual security assessment.)
    scopes: ['https://www.googleapis.com/auth/documents'],
  },
  content_scripts: [
    {
      // Open documents only (incl. multi-account /u/N/ URLs), never the Docs home page.
      matches: ['https://docs.google.com/document/d/*', 'https://docs.google.com/document/u/*/d/*'],
      js: ['src/content/content.ts'],
      run_at: 'document_idle',
    },
  ],
  // storage: settings. identity: Google sign-in for the Docs API.
  permissions: ['storage', 'identity'],
  // The overlay runs on Docs pages. The page count reads Docs' own PDF export, which Docs
  // redirects to a doc-*-docstext.googleusercontent.com host; without access to that host
  // the browser blocks the download and we can only estimate.
  host_permissions: ['https://docs.google.com/*', 'https://*.googleusercontent.com/*'],
  // The overlay (content script) shows the logo, so the page must be allowed to load it.
  web_accessible_resources: [
    {
      resources: ['icons/*'],
      matches: ['https://docs.google.com/*'],
    },
  ],
})
