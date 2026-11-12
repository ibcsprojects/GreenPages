// The overlay runs inside web pages (Google Docs), where a bundled asset URL would resolve
// against docs.google.com. Load the logo from the extension itself instead; icons/* is
// listed in web_accessible_resources for exactly this.
export const logoUrl = (): string => chrome.runtime.getURL('icons/icon128.png')
