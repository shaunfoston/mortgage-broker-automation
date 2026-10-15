# Mortgage Options

A mobile client-intake platform for UK mortgage brokers. You can create a client, complete a full fact-find, record the meeting, transcribe it, review AI-proposed values, capture a signed consent and produce branded PDFs. Everything stays encrypted on the phone.

> **Status (v0.4.0, 15 Oct 2026): test build.** Use **fictional clients only** until the security and compliance review in [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) is done. Nothing here is a claim of FCA or UK GDPR compliance.

![Architecture](docs/architecture.png)

## What's in the box

| Folder | What it is | Runtime dependencies |
|---|---|---|
| `app/` | Expo SDK 57 / React Native 0.86 app for Android and iOS | Expo modules (see `app/package.json`) |
| `server/` | Backend for broker sign-in, transcription jobs (AssemblyAI, EU region) and AI extraction (Claude) | **None.** It uses Node ≥ 22.18 built-ins only |
| `shared/` | Logic shared by app and server: fact-find schema (17 sections, 143 field definitions), validation, encrypted-DB repository, audit hash-chain, consent records, PDF templates, secure export | `@noble/hashes`, `@noble/ciphers` (audited, pure JS) |
| `docs/` | Setup, build, architecture, compliance, tracker, limitations, test results, sample PDFs | — |

## Quick start (Windows)

The full guide is [docs/WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md). The short version:

```bat
:: 1. Server in demo mode (no API keys, no npm install needed)
cd mortgage-options\server
node --disable-warning=ExperimentalWarning src\index.ts --demo

:: 2. App (needs npm and a free Expo account)
cd mortgage-options
npm install
cd app
npx eas-cli build --platform android --profile preview
```

The APK works with **no server at all** in its built-in **Offline demo** mode. To transcribe real speech, connect it to the server running in live mode with AssemblyAI and Anthropic keys.

## Tests

```bat
npm test
```

This runs 57 automated tests (shared logic, server API, provider contracts, full workflow, app orchestration). The latest results are in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md).

## Key documents

- [Implementation tracker](docs/IMPLEMENTATION_TRACKER.md): each requirement, its status and how it was verified
- [Architecture](docs/ARCHITECTURE.md)
- [Audit of the v3/v3.1 archive](docs/AUDIT_OF_V3.md)
- [Android build](docs/ANDROID_BUILD.md) · [iOS TestFlight](docs/IOS_TESTFLIGHT.md)
- [Demo script with a fictional client](docs/DEMO_SCRIPT.md)
- [UK GDPR / FCA notes](docs/COMPLIANCE.md) · [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Release notes](CHANGELOG.md)

© Mortgage Options | Powered by Dimond Automations
