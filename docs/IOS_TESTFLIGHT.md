# iOS test distribution (TestFlight)

## What you need

- An **Apple Developer Program** membership (£79/year): https://developer.apple.com/programs
  - This is an account action only you can take. Enrol as an **organisation** if the app will carry the firm's name. That needs a D-U-N-S number.
- An Expo account (same as Android)
- No Mac is required. EAS builds and signs in the cloud.

## Steps

```bat
cd mortgage-options\app
npx eas-cli login
set APP_VARIANT=production
npx eas-cli build --platform ios --profile production
```

1. Sign in with your Apple ID when asked. Let EAS create the distribution certificate and provisioning profile.
2. Upload the build to App Store Connect:
   ```bat
   npx eas-cli submit --platform ios --latest
   ```
3. In App Store Connect → **TestFlight**:
   - Add yourself (and colleagues) as **internal testers**. Internal testing needs no Apple review.
   - **Export compliance:** the app uses standard encryption (AES via SQLCipher, AES-GCM exports, HTTPS). Answer the encryption questions accordingly. Ask your adviser if unsure.
4. Testers install the **TestFlight** app, accept the invite, then install Mortgage Options.

### Alternative: ad-hoc install without TestFlight

```bat
npx eas-cli device:create
npx eas-cli build --platform ios --profile preview
```

1. `device:create` registers each iPhone by its UDID.
2. Open the build link on a registered iPhone to install.

## Notes

- iOS test builds use HTTPS only, plus `NSAllowsLocalNetworking` for private Wi-Fi addresses in the `preview` variant. A cloudflared HTTPS tunnel is the most reliable option on iPhone.
- Microphone and Face ID permission wording is set in `app.config.ts`.
- **Not verified:** no iOS build was produced in the development environment (no Apple account or Expo build access). The configuration type-checks against Expo SDK 57.
