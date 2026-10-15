# Known limitations and outstanding work

## Verification gaps (honest status)

| Item | Status |
|---|---|
| App on a physical Android/iOS device | **Not yet run.** The development environment couldn't download npm packages or reach Expo's build service. The app type-checks with 0 errors against the real Expo SDK 57 / RN 0.86.3 type definitions, and its orchestration logic is unit-tested, but the first device run happens on your EAS build. |
| Live AssemblyAI and Claude calls | **Not run with real keys.** Request and response handling is tested against the documented API shapes with mocked HTTP. Run `server\start-live.cmd`, which checks both keys before starting. |
| Real speech accuracy | Unknown until tested with live keys and real (fictional-scenario) conversations. Measure extraction precision before relying on it. |
| PDF rendering on device | Templates are tested and rendered in Chromium (`docs/samples`). On-device rendering via expo-print (Android WebView / iOS WKWebView) is not yet verified. |

## Security work outstanding before real client data

1. Independent penetration test of app and server.
2. Production hosting for the server: HTTPS with a real certificate, a stable domain, managed secrets, backups of `server/data/server.db` (accounts only) and OS patching. Quick cloudflared tunnels are for testing.
3. **Certificate pinning** is not implemented.
4. **Device management:** remote wipe and enforcement of an OS screen lock rely on the firm's MDM.
5. **Central backup:** client data lives only on the phone. If the phone is lost, data is protected (encrypted) but gone unless exported. A firm-side encrypted backup/sync service is not built.
6. **Multi-user / roles:** one broker per device. The server supports multiple broker accounts but has no admin UI or MFA.
7. Recording files are protected by OS file encryption (Android FBE / iOS Data Protection), not by an app-level key. The database is SQLCipher-encrypted.
8. PDFs generated for sharing are unencrypted by design. Share via the firm's secure channels. The encrypted export is the protected format.
9. PIN hash uses PBKDF2 (20,000 iterations) inside the hardware-backed keystore. Brute force is limited by escalating lockouts (30 s / 5 min / 30 min), not by KDF cost.
10. Export encryption runs in JavaScript. Large exports (tens of MB) take several seconds on older phones; the limit is 40 MB.

## Functional limitations

- **No lender sourcing, affordability calculators or recommendation letters.** The indicative LTV/LTI is labelled as such.
- **Recording stops if the phone locks or the app is backgrounded.** The screen is kept awake while recording; background recording is deliberately off.
- **Speaker labels** (A/B) are automatic and not mapped to names.
- **AI extraction** covers scalar fields and lists. It never fills the vulnerability section.
- **AI cost and rate:** 60 extractions/hour per broker (server limit).
- **Expo Go is not supported** for real use (no SQLCipher). Use the APK/TestFlight build.
- **Consent wording, privacy notice and firm details are placeholders** awaiting compliance approval.
- The v1/v2 PDFs and PPTX mentioned in the original README were not in the supplied archive and were not reviewed.
