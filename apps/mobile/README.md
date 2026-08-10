# Expedientes — Mobile Shell (Capacitor)

Thin native wrapper for Android/iOS that loads the clinic's deployed Expedientes
web app from its server URL. Nothing is bundled: deploying the web app updates
every installed device on next launch. Rebuild the app only when the server URL
or the branding changes.

## Prerequisites

- Node + npm (workspace root `npm install` pulls the Capacitor CLI).
- Android: Android Studio (includes SDK + Gradle).
- iOS: Xcode plus CocoaPods (`sudo gem install cocoapods`).

## Configure the server URL

Every Capacitor command needs `EXPEDIENTES_SERVER_URL` set; the config throws
otherwise, so a wrongly-pointed app can never be built silently.

```bash
export EXPEDIENTES_SERVER_URL=http://192.168.0.10   # the clinic server
```

Plain `http://` URLs work on Android (cleartext is enabled for the clinic LAN).
Use `https://` once the server sits behind a TLS reverse proxy.

## Build & install — Android

```bash
cd apps/mobile
npx cap sync android
npx cap open android    # opens Android Studio
```

In Android Studio: Build > Generate Signed App Bundle / APK > APK, using a
release keystore. Copy the APK to each device and open it to install (enable
"install from unknown sources" when prompted). A debug APK (Build > Build APK)
is for troubleshooting only — it enables WebView inspection over the
authenticated session, so it must not be handed to clinic staff.

## Build & install — iOS

```bash
cd apps/mobile
npx cap sync ios        # runs pod install; needs CocoaPods
npx cap open ios        # opens Xcode
```

In Xcode: select the connected device, set a development team under
Signing & Capabilities, then Run. The app stays installed on that device.
(TestFlight is only needed if the clinic ever wants over-the-air installs.)

Note: iOS App Transport Security blocks plain-`http://` web content by default.
Because the clinic runs iOS devices against the LAN URL, `ios/App/App/Info.plist`
carries `NSAllowsArbitraryLoadsInWebContent` (scoped to webview content, added
2026-08-10). Once the server is `https://`, this exception can be removed.

## Branding

Sources live in `assets/` (`icon.svg`, `icon-foreground.svg`, `splash.svg`),
rasterized to sibling PNGs: `icon.svg` → `icon-only.png`, `icon-foreground.svg`
→ `icon-foreground.png`, and `splash.svg` → both `splash.png` and
`splash-dark.png` (a byte-identical copy of `splash.png` is required by
`@capacitor/assets`). To change branding: edit the SVGs, then re-rasterize the
PNGs at the same sizes with `rsvg-convert` (1024² for icons, 2732² for splash).
Do not use `qlmanage` — it silently flattens transparency to white. Then:

```bash
npx capacitor-assets generate --android --ios \
  --assetPath assets \
  --iconBackgroundColor '#e11d48' --iconBackgroundColorDark '#e11d48' \
  --splashBackgroundColor '#e11d48' --splashBackgroundColorDark '#e11d48'
npx cap sync
```

## When the server is unreachable

The app shows a static "No se pudo conectar al servidor" page (`www/index.html`)
where supported; Reintentar navigates directly to the configured server URL
(baked into `www/server-url.js` at sync time), and closing/reopening the app
always retries the server URL.
