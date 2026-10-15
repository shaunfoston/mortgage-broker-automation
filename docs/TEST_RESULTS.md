# Automated test results

- Run: 2026-10-15 13:19 UTC · Node v22.22.0 · Linux
- Command: `npm test` (node:test; no external services; fictional data only)
- Type-check: shared **0** errors · server **0** errors · app **0** errors (app checked against Expo SDK 57 / React Native 0.86.3 published type definitions; react-native-svg, safe-area-context and vector-icons via typed stubs with the real Ionicons glyph list)

## Summary

```
ℹ tests 57
ℹ suites 0
ℹ pass 57
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7707.018796
```

## Detail

```
(node:3195) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/claude/mortgage-options/app/__tests__/meeting.test.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/claude/mortgage-options/app/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
✔ offline demo: transcribe, poll, extract, review proposals stored (27.18373ms)
✔ provider error and expiry mark the recording failed with a clear message (7.603002ms)
✔ cannot transcribe once the audio has been deleted; cannot extract without transcript (3.868332ms)
✔ health reports mode without secrets; security headers set (29.195859ms)
✔ login: wrong password, lockout, success, me (751.394586ms)
✔ transcription job lifecycle with ownership checks and purge (501.816304ms)
✔ extraction endpoint returns a normalised proposal (112.304011ms)
✔ app export decrypts with the independent node:crypto tool (87.720128ms)
✔ password hashing (304.524755ms)
✔ tokens: valid, expired, tampered, wrong secret, alg none (1.320323ms)
✔ rate limiter (0.301547ms)
✔ config: live mode demands keys and secrets; demo does not (2.4403ms)
✔ AssemblyAI: upload → transcript request uses EU endpoint, diarisation, documented models (48.671049ms)
✔ AssemblyAI: poll maps utterances; errors; delete (1.767602ms)
✔ AssemblyAI: retries 503 then succeeds; 401 surfaces without leaking key (804.294085ms)
✔ Claude: request uses Messages API with structured outputs; response parsed (4.505568ms)
✔ Claude: retries 529, handles refusal, max_tokens and bad JSON (808.644058ms)
✔ definition-of-success workflow (server mode) (705.853451ms)
✔ offline demo backend works with no server at all (4.121615ms)
✔ server backend reports unreachable server clearly (1.075584ms)
✔ sha256 matches node:crypto (6.688784ms)
✔ base64 round-trips and matches Buffer (4.922943ms)
✔ uuid v4 format and uniqueness (6.314478ms)
✔ canonicalJson is key-order independent (0.317848ms)
✔ PIN hashing verifies and rejects (38.602405ms)
✔ AES-GCM output is decryptable by node:crypto (interop) (2.132233ms)
✔ secure export round-trip, wrong passphrase and tamper detection (41.844513ms)
✔ audit chain detects edits, deletions and reordering (0.970259ms)
✔ UTF-8 fallback codec matches TextEncoder/TextDecoder (0.969253ms)
✔ base URL normalisation and private-host detection (23.767189ms)
✔ JSON schema satisfies Claude structured-output constraints (3.015774ms)
✔ prompts include safety rules and transcript delimiters (0.654738ms)
✔ normaliseExtraction coerces values and rejects invalid proposals (2.852803ms)
✔ normaliseExtraction blocks unknown, out-of-scope and protected paths (0.422361ms)
✔ conflicting statements are capped at medium confidence (0.243147ms)
✔ garbage input never throws (1.392804ms)
✔ schema has unique section ids and field keys (3.035711ms)
✔ parsePath enforces owner/scope (0.680613ms)
✔ set/get values immutably and progress tracks required fields (1.481668ms)
✔ parseFactFind tolerates bad JSON (1.876821ms)
✔ computeMetrics: LTV, LTI, commitments after completion (1.007972ms)
✔ self-employed income uses the lower of the last two years (0.304127ms)
✔ escapeHtml neutralises markup (0.920892ms)
✔ fact-find PDF HTML is branded, escaped and marks AI values (2.053603ms)
✔ meeting summary includes transcript and demo banner (0.557556ms)
✔ consent record shows signature, timestamps, hashes and draft warning (0.655936ms)
✔ migrations are idempotent (2.570966ms)
✔ end-to-end case lifecycle with fictional client, persisted across reopen (174.899057ms)
✔ joint case: applicant 2 data and consents for both applicants (5.093169ms)
✔ concurrent transactions are serialised and audit seq stays gapless (9.360349ms)
✔ bulk accept never overwrites a different existing value (42.983837ms)
✔ signature strokes become a valid SVG data URL (4.31909ms)
✔ parseMoney handles UK formats (1.491578ms)
✔ parseDate reads UK day-first dates and rejects impossible dates (0.733984ms)
✔ postcodes are normalised (0.292518ms)
✔ coerceValue validates by field type (2.434236ms)
✔ formatGBP (0.305777ms)
```
