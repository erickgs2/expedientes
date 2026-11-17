# Building an Android APK for testers

The mobile app is a thin Capacitor shell: it loads the deployed web app from a URL, so auth cookies
and relative `/api` paths behave exactly as in a browser. Building an APK is therefore about
packaging a pointer to the server, not the app itself — **there is no offline mode, and a tester
with no route to the server sees the fallback page.**

The server URL is baked in at sync time, so **a build only ever points at one environment.** Rebuild
to retarget.

## One-time: the Android SDK

macOS with Homebrew. Java 21 is already required by this repo's Gradle setup — check with
`java -version` before starting.

```bash
brew install --cask android-commandlinetools

# Put these in ~/.zshrc so they survive a new terminal
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$ANDROID_HOME/platform-tools:$PATH"

sdkmanager --licenses          # accept all
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

`android-35` matches `compileSdkVersion`/`targetSdkVersion` in
[apps/mobile/android/variables.gradle](../../apps/mobile/android/variables.gradle) — if those change,
install the matching platform.

Android Studio works instead if you prefer a GUI; it installs the same SDK, and you can then open
`apps/mobile/android` and use Build → Build APK.

## Build

```bash
# Point at the environment the testers should reach. HTTPS is not optional — see below.
export EXPEDIENTES_SERVER_URL=https://intech-dev.duckdns.org

npx cap sync android
cd apps/mobile/android
./gradlew assembleDebug
```

The APK lands at:

```
apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Send that file however you like — AirDrop, Drive, WhatsApp. Testers must allow "install from unknown
sources" for whichever app delivers it.

**Use HTTPS.** Over `http://` the session cookie is `secure` and the WebView discards it, so login
fails with no visible error — the same trap as in a browser. Point the build at the DuckDNS domain,
never the LAN IP.

## Debug vs release

`assembleDebug` is the fast path and fine for a handful of trusted testers. It has real drawbacks:

- The APK is marked debuggable, so anything on the device can attach to it. On an app showing
  patient records, that is worth caring about beyond a small trusted circle.
- It is signed with the shared Android debug key, which is not a distribution identity.

For anything beyond quick smoke tests, build a signed release. Create a keystore once:

```bash
keytool -genkeypair -v -keystore ~/expedientes-release.jks \
  -alias expedientes -keyalg RSA -keysize 2048 -validity 10000
```

**Back that file and its passwords up somewhere safe.** Losing it means every future build has a
different identity, and testers must uninstall before they can update.

Put the credentials in `~/.gradle/gradle.properties` — a path outside this repo, so they cannot be
committed:

```properties
EXPEDIENTES_STORE_FILE=/Users/you/expedientes-release.jks
EXPEDIENTES_STORE_PASSWORD=...
EXPEDIENTES_KEY_ALIAS=expedientes
EXPEDIENTES_KEY_PASSWORD=...
```

Add to `apps/mobile/android/app/build.gradle`, inside `android { }`:

```gradle
signingConfigs {
    release {
        if (project.hasProperty('EXPEDIENTES_STORE_FILE')) {
            storeFile file(EXPEDIENTES_STORE_FILE)
            storePassword EXPEDIENTES_STORE_PASSWORD
            keyAlias EXPEDIENTES_KEY_ALIAS
            keyPassword EXPEDIENTES_KEY_PASSWORD
        }
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
    }
}
```

Then `./gradlew assembleRelease`, and the APK appears under `app/build/outputs/apk/release/`.

## Shipping updates to testers

Android refuses to install an APK over one with the same or higher `versionCode`. Bump it in
[apps/mobile/android/app/build.gradle](../../apps/mobile/android/app/build.gradle) for every build you
hand out:

```gradle
versionCode 2
versionName "1.0.1"
```

Forget this and testers see "app not installed" with no useful explanation.

## Before handing it out

The shell only shows what the server serves, so the server has to be ready first:

- The DuckDNS hostname resolves and Caddy holds a valid certificate — a self-signed or expired one
  makes the WebView show a blank page rather than a warning it can click through.
- Test from **mobile data, not home WiFi.** Many routers do not support NAT loopback, so the domain
  can fail from inside the house while working perfectly everywhere else.
- Each tester needs an account. Create them under `/admin/users` with a role scoped to what they
  should see — do not hand out the seed admin login.

## Troubleshooting

**Blank white screen on launch.** The server was unreachable or its certificate was rejected. Open
the same URL in the phone's browser to confirm.

**Login does nothing.** The build points at `http://`. Rebuild against the HTTPS domain.

**"App not installed".** Same `versionCode` as the copy already on the device, or a different signing
key than the installed build. Bump the version, or have them uninstall first.

**Gradle cannot find the SDK.** `ANDROID_HOME` is unset in that shell. It must be exported before
`./gradlew`, which is why it belongs in `~/.zshrc`.
