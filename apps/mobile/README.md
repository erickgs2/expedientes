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

In Android Studio: Build > Generate Signed App Bundle / APK > APK (a debug APK
via Build > Build APK works fine for internal use). Copy the APK to each device
and open it to install (enable "install from unknown sources" when prompted).

## Build & install — iOS

```bash
cd apps/mobile
npx cap sync ios        # runs pod install; needs CocoaPods
npx cap open ios        # opens Xcode
```

In Xcode: select the connected device, set a development team under
Signing & Capabilities, then Run. The app stays installed on that device.
(TestFlight is only needed if the clinic ever wants over-the-air installs.)

Note: if the server URL is plain `http://` and iOS devices are in use, Safari's
App Transport Security will block it; add an ATS exception in
`ios/App/App/Info.plist` for the server host at that point. It is deliberately
not pre-added.

## Branding

Sources live in `assets/` (`icon.svg`, `icon-foreground.svg`, `splash.svg`,
rasterized to the sibling PNGs). To change branding: edit the SVGs, re-rasterize
the PNGs at the same sizes with `rsvg-convert` (1024² icons, 2732² splash) — do not use qlmanage, it silently flattens transparency to white, then:

```bash
npx capacitor-assets generate --android --ios \
  --assetPath assets \
  --iconBackgroundColor '#e11d48' --iconBackgroundColorDark '#e11d48' \
  --splashBackgroundColor '#e11d48' --splashBackgroundColorDark '#e11d48'
npx cap sync
```

## When the server is unreachable

The app shows a static "No se pudo conectar al servidor" page (`www/index.html`)
where supported; Reintentar retries the last navigation, and closing/reopening
the app always retries the server URL.
