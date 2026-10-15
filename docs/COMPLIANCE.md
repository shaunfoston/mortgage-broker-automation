# UK GDPR & FCA: what the software does and what the firm must still do

> **Not legal or compliance advice.** This document maps technical features to obligations so a qualified compliance professional can review them. **No compliance is claimed.** All consent and disclosure wording in the app is marked as a draft.

## UK GDPR / Data Protection Act 2018

| Obligation | Implemented in software | Still needed from the firm |
|---|---|---|
| Lawful basis (Art. 6) and special category conditions (Art. 9) | Consent screen captures separate statements: privacy notice given, processing for advice/applications, optional explicit consent for health/sensitive data, recording/AI, optional marketing. | Decide the lawful basis per purpose. Consent is often *not* the right basis for core advice processing (contract or legitimate interests may be). Approve the wording. |
| Transparency (Arts. 13–14) | "Privacy notice given" is a required statement. The recording disclosure script is read before recording. | Write and publish a privacy notice naming AssemblyAI and Anthropic as processors, with transfers and retention. |
| Data minimisation | The server keeps no client records. Server audio is deleted after upload, transcripts are purged on collection or within 24 h, and AssemblyAI copies are deleted via its API. Option to delete local audio and keep the transcript. | Set retention periods (audio vs transcript vs file). |
| Security (Art. 32) | SQLCipher AES-256 database (key in Android Keystore / iOS Keychain); PIN + optional biometrics; auto-lock; screenshot and app-switcher protection; Android backups disabled; HTTPS (plain HTTP refused except private Wi-Fi in test builds); scrypt passwords; signed expiring tokens; login lockout; rate limits; encrypted server-side transcripts; no keys in the app; AES-256-GCM exports. | Independent penetration test. Device policy (MDM, OS updates, remote wipe). Cyber Essentials. Server hosting hardening. |
| Processors (Art. 28) | AssemblyAI EU endpoint configured by default; Anthropic used with text only. | Sign or accept DPAs with AssemblyAI and Anthropic. Record their sub-processors. |
| International transfers | AssemblyAI EU region keeps audio in the EU. | Anthropic processing may be outside the UK. Confirm the transfer mechanism (e.g. UK Extension to the EU–US DPF, or IDTA/Addendum) and do a transfer risk assessment. |
| DPIA (Art. 35) | — | **Required in practice**: AI processing of recorded conversations that may include special category data. |
| Rights: access/portability | Encrypted case export containing every record held for a case. | SAR procedure; how to deliver the passphrase. |
| Rights: erasure | "Erase client" deletes every record and file for the client. The audit keeps only a reason code. | Check legal retention obligations before erasing (see FCA below). |
| Records of processing (Art. 30) | Tamper-evident audit trail of actions. | Maintain ROPA. |
| Automated decisions (Art. 22) | AI only proposes data; the broker makes every decision. No automated decision about the client. | Document this in the DPIA. |

## FCA (mortgage advice and arranging)

| Area | Implemented in software | Still needed from the firm |
|---|---|---|
| MCOB 4 / 11: suitability and affordability evidence | Structured fact-find covering income, expenditure, commitments, credit history, deposit and source of funds, property, requirements, preferences, future changes, retirement; indicative LTV/LTI clearly labelled "not an affordability assessment". | The firm's own suitability process, lender research tools and recommendation letters are outside this app. |
| Record keeping (SYSC 9, MCOB 4.11 / 11.6) | Persistent records, provenance of every value (manual vs AI-accepted), consent records with hashes, notes, audit history, PDFs. | Retention policy (typically several years for mortgage advice records). Central backup/archive (the app stores on the phone; export to the firm's system). |
| Consumer Duty (PRIN 2A) and vulnerable customers (FG21/1) | A dedicated "Customer circumstances" section **never filled by AI**. AI flags *possible* indicators neutrally for adviser judgement. Client agreement to record vulnerability information is captured. | Vulnerability policy, training, outcome monitoring. |
| Use of AI | Human-in-the-loop review with confidence and quotes. Prompt-injection defences (transcript treated as untrusted). Model, prompt version and every decision are recorded. | AI governance (SM&CR accountability, model risk, testing on representative data, periodic review of extraction accuracy). |
| Call recording | Disclosure script and an explicit "client agreed" confirmation with timestamp before recording can start. | Confirm the recording policy. Mandatory recording rules (COBS 11.8) don't generally apply to mortgage advice, but if you record, the recordings are records. |
| Electronic signatures | Simple electronic signature with signer, timestamp, time zone, device, witness and integrity hashes. | Confirm acceptability for each purpose (lenders may require their own declarations/e-sign). |
| Financial promotions / disclosure | Firm name and FRN placeholders in consent wording. | Insert the firm's details. Ensure initial disclosure / IDD-equivalent documents are provided. |

## Evidence available for review

- Source code and automated tests (`npm test`; see [TEST_RESULTS.md](TEST_RESULTS.md)).
- Sample outputs: [`samples/`](samples/) (fact-find, meeting summary, consent record, audit PDFs).
- Threat model and outstanding items: [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
