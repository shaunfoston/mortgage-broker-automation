# Implementation tracker: v0.4.0 (15 Oct 2026)

Legend:

- ✅ **Verified**: implemented and proven by automated tests, or run here
- 🟡 **Built, device-unverified**: implemented, type-checks against the real Expo SDK 57 / RN 0.86.3 types, logic unit-tested; not yet run on a phone
- 🔶 **Needs you or the firm**: depends on accounts, credentials or professional review
- ⬜ **Not done**

## Required functionality

| # | Requirement | Status | Evidence / where |
|---|---|---|---|
| 1 | Professional interface: royal blue, graphite, white | 🟡 | `app/src/lib/theme.ts`, `shared/src/brand.ts`; WCAG contrast checked (royal #1F4FD8 = 6.6:1 on white). PDFs verified visually: `docs/samples/*.png` ✅ |
| 2 | Client and mortgage case management | ✅ logic · 🟡 UI | Repo tests: create/search/update clients, cases with references `MO-YYYY-NNNN`, status workflow, joint applicants, erasure (`shared/test/repo.test.ts`) |
| 3 | Comprehensive UK fact-find | ✅ logic · 🟡 UI | 17 sections, 143 fields: personal, contact, 3-year address history, employment & income (employed/self-employed/director), other income, credit commitments, credit history, dependants, expenditure, assets, other properties, deposit & source of funds, property, mortgage requirements, protection, objectives, Consumer Duty circumstances. UK validation tests (`values.test.ts`, `model.test.ts`) |
| 4 | Meeting recording with permissions and disclosures | 🟡 | `record.tsx`: disclosure script, "client agreed" gate with timestamp (enforced in repo, ✅ tested), mic permission text in `app.config.ts`, denied-permission path, keep-awake, pause/resume, 2 h cap, mono AAC 64 kbps |
| 5 | Speech-to-text with a genuinely supported service | ✅ contract · 🔶 live key | AssemblyAI (EU endpoint, documented `speech_models`, `speaker_labels`, delete-after-use). Claude has no audio input; verified in Anthropic's model docs. Request shapes tested with mocked HTTP (`providers.test.ts`); job lifecycle tested end to end in demo mode (`api.test.ts`, `workflow.test.ts`) |
| 6 | Claude extraction with confidence and broker review | ✅ logic · 🟡 UI · 🔶 live key | Claude Messages API with `output_config.format` JSON schema (current, non-deprecated parameter); schema constraints tested; server- and app-side re-validation; confidence bands; evidence quotes; conflict capping; bulk-accept skips conflicts; nothing applied before review (`extraction.test.ts`, `repo.test.ts`) |
| 7 | Consent and e-signature with timestamps and records | ✅ logic · 🟡 UI | Versioned wording, required items, signer, UTC + local + time zone, device, witness, SVG signature, text/signature/record SHA-256 hashes, tamper detection, withdrawal (`repo.test.ts`, `signature.test.ts`, `pdf.test.ts`) |
| 8 | Persistent storage | ✅ | SQLite with migrations; close-and-reopen test proves persistence (`repo.test.ts`, `workflow.test.ts`). On device: expo-sqlite + SQLCipher 🟡 |
| 9 | Branded PDFs: fact-find, meeting summary, consent | ✅ templates · 🟡 on device | `shared/src/pdf/templates.ts` (+ audit PDF); HTML-escaping tested; rendered samples in `docs/samples/` |
| 10 | Document uploads, notes, audit history, secure export | ✅ logic · 🟡 UI | Documents with SHA-256 fingerprints; notes; hash-chained append-only audit (DB triggers tested); AES-256-GCM export decrypted by an independent tool (`crypto.test.ts`, `api.test.ts`) |
| 11 | Authentication, encryption, access controls | ✅ server · 🟡 app | Server: scrypt, HS256 tokens with expiry, lockout, rate limits, per-broker job isolation, security headers, encrypted transcripts (`auth.test.ts`, `api.test.ts`). App: PIN + biometrics, escalating lockout, auto-lock, SQLCipher, screenshot blocking, no Android backup |
| 12 | UK GDPR and FCA documented and implemented where applicable | 🔶 | `docs/COMPLIANCE.md` maps features to obligations; erasure, export, minimisation, purge implemented ✅. Professional review, DPIA, DPAs, privacy notice and wording approval outstanding |

## Engineering rules

| Rule | Status |
|---|---|
| Repair before adding complexity | ✅ Audit in `AUDIT_OF_V3.md`; same stack kept; server reduced to zero dependencies |
| Supported, maintained dependencies | ✅ Expo SDK 57 (latest stable; SDK 58 is still RC) with versions from Expo's compatibility list; `expo-audio` replaces deprecated `expo-av`; `@noble` crypto |
| Never assume Claude transcribes audio | ✅ Verified in docs; test asserts text-only request |
| No AI keys in the app | ✅ Keys exist only in `server/.env`; the app has no key fields |
| No real client data in testing | ✅ All fixtures fictional (example.com, 07700 900xxx, ZZ99 postcodes); in-app warnings |
| No compliance claims without review | ✅ Drafts labelled in app, PDFs and docs |
| Automated tests executed | ✅ 57 tests passing (`TEST_RESULTS.md`) |
| Android & iOS builds where the environment permits | 🔶 Environment had no npm, Android SDK or Expo build access. Reproducible EAS process documented |
| Tracker and architecture diagram | ✅ This file, `architecture.png` |
| Version control and release notes | ✅ Git history included in the archive; `CHANGELOG.md` |

## Definition of success (on your phone)

| Step | Automated equivalent | On device |
|---|---|---|
| Open app, create fictional client | ✅ | 🟡 |
| Complete a fact-find | ✅ | 🟡 |
| Record and transcribe a test meeting | ✅ (demo provider; mocked live API) | 🟡 / 🔶 keys for live |
| Review extracted information | ✅ | 🟡 |
| Capture a signature | ✅ | 🟡 |
| Save, close, reopen | ✅ | 🟡 |
| Export a PDF | ✅ (HTML → Chromium PDF) | 🟡 |

**Next action:** build the APK (`docs/WINDOWS_SETUP.md` step 5), run `docs/DEMO_SCRIPT.md`, and report any issue.
