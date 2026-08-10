import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CapacitorConfig } from '@capacitor/cli';

// The native app is a remote-URL shell: it loads the clinic's deployed web app
// directly, so auth cookies and relative /api URLs behave exactly as in a browser.
const serverUrl = process.env['EXPEDIENTES_SERVER_URL'];
if (!serverUrl) {
  throw new Error(
    'EXPEDIENTES_SERVER_URL is not set. Export the clinic server URL before running ' +
      'Capacitor commands, e.g.:\n' +
      '  EXPEDIENTES_SERVER_URL=http://192.168.0.10 npx cap sync'
  );
}

// Bake the server URL into the web assets at sync time (before the CLI copies
// www/ into each native project) so the offline fallback page's retry button
// can navigate directly to it, even on iOS where a provisional navigation
// failure leaves no history entry for history.back() to use.
writeFileSync(
  join(__dirname, 'www', 'server-url.js'),
  `window.EXPEDIENTES_SERVER_URL = ${JSON.stringify(serverUrl)};\n`
);

const config: CapacitorConfig = {
  appId: 'com.expedientes.app',
  appName: 'Expedientes',
  webDir: 'www',
  android: {
    webContentsDebuggingEnabled: false,
  },
  server: {
    url: serverUrl,
    // The clinic server may be reached over plain http on the LAN until a TLS
    // reverse proxy exists.
    cleartext: true,
    // Shown when the server cannot be loaded (supported on Android; harmless elsewhere).
    errorPath: 'index.html',
  },
};

export default config;
