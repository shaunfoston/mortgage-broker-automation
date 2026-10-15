# Android build

Build profiles are defined in `app/eas.json`:

| Profile | Output | Install on | Network |
|---|---|---|---|
| `preview` | `.apk`, app id `uk.mortgageoptions.app.test` | Any Android phone (sideload) | HTTPS, plus `http://` to private Wi-Fi addresses for testing |
| `production` | `.aab`, app id `uk.mortgageoptions.app` | Google Play (internal testing track) | HTTPS only |
| `development` | Dev client | Developers | — |

## A. Cloud build with Expo EAS (recommended)

```bat
cd mortgage-options
npm install
cd app
npx eas-cli login
npx eas-cli init            :: once; paste the project ID into app.config.ts
npx expo-doctor             :: should report no problems
npx eas-cli build --platform android --profile preview
```

1. EAS creates and stores an Android signing key on first build. Answer **Yes** to "Generate a new Android Keystore".
2. When the build finishes, open the link on the phone and install the APK.

The build is reproducible: the same commit, `package-lock.json` and SDK 57 image give the same app. Versions are pinned to the Expo SDK 57 compatibility list (`packages/expo/bundledNativeModules.json`).

## B. Local build (Android Studio)

1. Install Android Studio (2025.x or newer) with SDK 36 and JDK 17.
2. Set `ANDROID_HOME`.
3. Run:
   ```bat
   cd mortgage-options\app
   set APP_VARIANT=preview
   npx expo prebuild --platform android
   npx expo run:android --variant release
   ```
4. Without your own release keystore the APK is debug-signed. That's fine for personal testing, not for distribution.

## Why not Expo Go?

The app uses SQLCipher (encrypted database) and native config plugins. Expo Go can't load those. It would run with an unencrypted database, and the Settings screen would show "Database encryption: OFF". Use the APK.

## What was and was not verified

- `app.config.ts`, every screen and every library call type-check with **0 errors** against the published Expo SDK 57 / React Native 0.86.3 type definitions.
- The development environment used to write this release had no Android SDK and no access to Expo's build service, so **no APK was built here**. The first EAS build on your account is the first native build. Report any build log errors and they can be fixed quickly.
