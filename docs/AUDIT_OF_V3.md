# Audit of the supplied archive (Master_Mortgage_Intake_ALL_v1.zip)

Audited 15 Oct 2026.

## Contents received

| Item | Present? |
|---|---|
| `README.md`, `Master_Mortgage_Intake_MASTER_PROMPT_v1.md` | Yes |
| `code/v3/mortgage-options-v3.zip` (Expo + Node) | Yes |
| `code/v3.1/mortgage-options-v3-sqlite.zip` (adds SQLite) | Yes |
| v1/v2 documentation (PDFs, PPTX) listed in the README | **Missing.** Not in the archive |

v3.1 is v3 plus `expo-sqlite` persistence. It was audited as the baseline.

## What was broken

| # | Area | Finding | Impact |
|---|---|---|---|
| 1 | Transcription | The server sends audio to Claude as an `input_audio` content block. The Claude Messages API accepts text and images only; there is no audio input. | Transcription could never work. |
| 2 | Transcription | The model `claude-3-5-sonnet-20240620` is retired. | Every request would fail. |
| 3 | Server | `package.json` installs `anthropic@^0.21` but the code imports `@anthropic-ai/sdk`. | The server crashes on start (module not found). |
| 4 | App start-up | `"main": "./src/App.tsx"` with no `registerRootComponent`. | The app won't launch. |
| 5 | Database | Calls `SQLite.openDatabase`, which expo-sqlite 14 moved to `expo-sqlite/legacy`. | Crash on first database call. |
| 6 | Platform | Expo SDK 51 / RN 0.74.0 (SDK 51 expects 0.74.5). Current Expo Go only opens the latest SDK. | Can't be opened on a current phone. |
| 7 | Permissions | No microphone permission text in `app.json`; the permission result is ignored. | iOS rejects the build; Android records nothing or crashes. |
| 8 | Data model | No clients or cases. The fact-find has 6 free-text fields; consents aren't linked to anyone. | Doesn't meet the requirements. |
| 9 | Consent | A toggle and a signature with an SQLite `datetime('now')` timestamp. No consent wording version, signer, time zone or integrity hash. | Weak evidence. |
| 10 | PDF | Client text is interpolated into HTML unescaped. | HTML/script injection into PDFs. |
| 11 | Security | No auth on the server, `cors()` open to all, no rate limits. A failed request leaves the audio on disk. No app lock or encryption. | Anyone who can reach the server can spend the API credit. Data is unprotected. |
| 12 | Engineering | No tests, no version control, no lockfile. | — |

## What was reused

- Brand: royal blue, graphite (#1C1C1C) and white. #007BFF was darkened to #1F4FD8 because white text on #007BFF fails WCAG AA contrast (3.98:1).
- The screen flow (Home → Fact-Find → Record → Consent), expanded into a case-based workflow.
- The concept of a drawn signature captured on device (now SVG, with no WebView).
- `expo-print` for PDFs (kept, with escaped, branded templates).
- `expo-sqlite` for storage (kept, now the async API with SQLCipher encryption).

## Decision

The v3.1 code was too small and too broken to repair line by line. Fixes 1–7 alone touch every file. The project was rebuilt on the same stack (Expo, Node, SQLite), keeping the reusable parts above.
