# Ionic/Capacitor Packaging — Installable iOS/Android Builds

Status: approved
Date: 2026-08-10

## Purpose

Package the finished Expedientes web app as installable Android and iOS apps for the clinic's
devices. This is the seventh and final top-level module in the roadmap (see
`2026-08-01-project-overview.md`), which already fixed the approach: Capacitor wraps the same
Angular app — no Ionic UI component set, Angular Material stays the single UI system.

## Scope

In scope:
- A Capacitor project at `apps/mobile/` with generated, committed `android/` and `ios/` native
  projects.
- Remote-URL shell: the native app loads the clinic's deployed web app directly from its server
  URL, exactly as a browser would.
- Build-time server URL configuration via an `EXPEDIENTES_SERVER_URL` environment variable.
- Cleartext (plain http) support on Android, so devices can reach the server via LAN IP before the
  clinic sets up TLS.
- Minimal generated branding: app icon and splash screen (white spa glyph on the rose `#e11d48`
  brand color, "Expedientes" wordmark on the splash), generated for all densities via
  `@capacitor/assets`.
- A static fallback/error page shown when the server is unreachable.
- Safe-area handling in the web app so the toolbar clears notches/status bars inside the webview.
- An operator README covering configuration, building, and installing on devices.

Out of scope (deliberate):
- Bundling the Angular build into the app binary. The shell loads the live site; offline use is
  explicitly not required for v1 ("tablet/mobile assumed always connected").
- App-store distribution. Installs are direct: sideloaded APK on Android, Xcode-to-device on iOS
  (TestFlight can come later if ever needed). No store accounts, listings, or review cycles.
- Native plugins (camera, push, biometrics). The web app's existing file inputs and flows work
  inside the webview; nothing needs the Capacitor JS bridge. The remote site does not load the
  Capacitor runtime at all.
- A first-launch server-URL settings screen. The URL is fixed at build time; changing servers
  means rebuilding — acceptable for a single clinic.

## Architecture

### Project layout

`apps/mobile/` is a self-contained Capacitor project, deliberately **not** an Nx build target:
there is no web-asset bundling step (the shell loads a remote URL), and native builds run through
Capacitor's CLI plus Android Studio / Xcode, not through `nx`. Contents:

- `capacitor.config.ts` — app id `com.expedientes.app`, app name `Expedientes`, `webDir: 'www'`,
  and a `server` block: `url` read from `process.env['EXPEDIENTES_SERVER_URL']` at
  `npx cap sync` time, `cleartext: true`. If the variable is unset, the config throws with a
  clear message — failing the sync loudly beats silently building an app pointed nowhere.
- `www/` — a minimal static fallback page (see Error Handling).
- `android/`, `ios/` — the generated native projects, committed to git as Capacitor convention
  (they carry real, hand-edited config: cleartext manifest flag, icons, splash).
- `assets/` — the two branding source images consumed by `@capacitor/assets`.
- `README.md` — the operator playbook.
- `package.json` — a minimal private marker (`name` + `private: true`, no dependencies): the
  Capacitor CLI refuses to run without one in its working directory. It does not make
  `apps/mobile` an Nx build target.

Dependencies (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`, dev-only
`@capacitor/assets`) are pinned at the workspace root like the rest of the toolchain.

### Remote-URL shell

The native app is a thin wrapper whose webview loads the deployed web app from
`EXPEDIENTES_SERVER_URL` — the same origin the browser uses today. Consequences, all deliberate:

- Cookie (httpOnly JWT) auth, relative `/api` URLs, `multipart/form-data` uploads, and the
  Fabric.js diagram canvas work unchanged. Same origin, so no CORS or webview-cookie work.
- Deploying the web app updates every installed device on next load; the APK/IPA is only rebuilt
  when the server URL or branding changes.
- The app requires network to load — matching the project's standing "always connected"
  assumption.

### Android specifics

- `server.cleartext: true` in the Capacitor config plus `android:usesCleartextTraffic="true"` in
  the manifest, so `http://<LAN IP>` works before the clinic adds a TLS reverse proxy. HTTPS URLs
  keep working when that happens. Accepted trade-off: transport is unencrypted only on the
  clinic's private LAN.
- Hardware back button: Capacitor's default `BridgeActivity` behavior is correct for a remote
  shell — it walks the webview history back and leaves the app at the root. No custom native code.

### iOS specifics

No special configuration beyond generated branding. `NSAppTransportSecurity` exceptions for
cleartext are added only if the clinic actually runs iOS devices against a plain-http URL —
documented in the README rather than pre-added, since ATS exceptions invite App Store questions
and direct Xcode installs don't need pre-approval.

### Web-side changes (the only Angular edits)

Inside the native shell the webview covers the full screen, so fixed UI can collide with the
iPhone notch / Android status bar. Both changes are no-ops in regular browsers:

- `viewport-fit=cover` added to the viewport meta in `apps/web/src/index.html`.
- `padding-top: env(safe-area-inset-top)` on the sticky toolbar, and
  `padding-bottom: env(safe-area-inset-bottom)` on the page content container, in the shell
  component's styles.

The Angular app otherwise never knows it is running inside Capacitor.

### Branding

Two source images in `apps/mobile/assets/`: an icon (white spa glyph, matching the login screen
and toolbar brand mark, on solid rose `#e11d48`) and a splash (same glyph plus the "Expedientes"
wordmark, centered on rose). `npx capacitor-assets generate` produces every required icon and
splash density for both platforms. Replacing the branding later = replace the two sources and
regenerate.

## Error Handling

- Server unreachable at launch or navigation: the webview shows the static fallback page from
  `www/` — a Spanish "No se pudo conectar al servidor" message with a retry button that reloads
  the server URL — wired via Capacitor's `server.errorPath` where supported; otherwise the
  platform webview's default error surface appears and the README notes the limitation.
- Everything after a successful load is the web app's own error handling, unchanged.

## Testing

Low effort, per project convention:
- `npx cap sync` completes cleanly for both platforms with the config as committed.
- The fallback page and Capacitor config are verified by inspection.
- Actual APK/IPA builds and on-device installs are manual operator steps (Android Studio → APK →
  sideload; Xcode → device), documented step-by-step in `apps/mobile/README.md` — they require
  Android Studio / Xcode and physical devices, so they are exercised by the user, not CI.
