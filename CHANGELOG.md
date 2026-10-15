# Release notes

## v0.4.0: complete rebuild (15 Oct 2026)

First complete build of Mortgage Options, replacing the v3/v3.1 prototype. See `docs/AUDIT_OF_V3.md` for why.

### New

- **App (Expo SDK 57, React Native 0.86):**
  - PIN/biometric lock and encrypted database
  - Clients and cases
  - 17-section UK fact-find with validation and progress
  - Meeting recording with disclosure and consent gate
  - Transcription status tracking
  - AI review screen (confidence, quotes, accept/edit/reject, bulk accept)
  - Consent with finger signature and integrity hashes
  - Documents, notes, audit history
  - Four branded PDFs
  - AES-256 encrypted case export
  - Offline demo mode
- **Server (Node, zero dependencies):**
  - Broker accounts and sign-in
  - AssemblyAI EU transcription jobs with delete-after-use
  - Claude structured extraction with server-side validation
  - Demo mode
  - Config checker, user and decrypt tools, Windows `.cmd` launchers
- **Shared logic** used by both, with 57 automated tests.
- **Documentation:**
  - Windows setup, Android/iOS build, demo script
  - Architecture diagram, compliance map, limitations, tracker

### Fixed (from v3.1)

- Transcription now uses a real speech-to-text service. The old code sent audio to Claude, which doesn't accept audio.
- Server start-up crash (wrong SDK package) and retired model.
- App start-up crash (entry point, legacy SQLite API) and the outdated SDK.
- Unescaped client data in PDFs.
- No authentication or encryption.

### Known issues

See `docs/KNOWN_LIMITATIONS.md`. Most important: the app has not yet been run on a physical device, and live AI calls have not been made with real keys.
