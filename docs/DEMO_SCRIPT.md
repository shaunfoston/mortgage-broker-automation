# Demonstration script: fictional client "Jordan Testwell"

This walks through the definition of success on the phone. Use only the fictional data below.

| Step | Do this | You should see |
|---|---|---|
| 1 | Open the app, set your name and a PIN | Home screen with an "Offline demo mode" banner |
| 2 | **New client** → First `Jordan`, Surname `Testwell`, purpose *First-time purchase* → **Create** | Case hub `MO-2026-0001`, fact-find 0% |
| 3 | **1. Fact-find** → *Applicant 1 · Contact & address* → mobile `07700 900123`, address `12 Example Road, Testville`, postcode `zz99 3zz` → **Save** | "Saved". The postcode is normalised to `ZZ99 3ZZ` |
| 4 | Try salary `lots` in *Employment & income* → **Save** | Field error. Nothing is saved |
| 5 | **2. Record** → read the disclosure script → tick "client has agreed" → **Start recording** → speak for 30 s → **Stop and save** | A recording card shows `RECORDED` with its duration |
| 6 | **Transcribe** | `PROCESSING`, then `TRANSCRIBED` after a few seconds |
| 7 | **View transcript** | Speaker-labelled transcript. In demo mode it's the fictional sample |
| 8 | **Extract fact-find details with AI** | Review screen: summary, a vulnerability indicator (bereavement) and 40+ proposals with HIGH/MEDIUM/LOW confidence and quotes |
| 9 | **Accept all high-confidence** | Accepted. Postcode already matched, so it's not overwritten |
| 10 | Bonus (MEDIUM 72%) → **Edit** → `2800` → **Save edit**; Deposit → **Reject** | Items move to "decided" |
| 11 | Back to the case → **4. Consent & signature** → tick the two required statements → sign with your finger → **Save signed consent** | Badge `VERIFIED`. Case status is now *Consent signed* |
| 12 | **Close the app completely** (swipe away) and reopen → enter PIN | Everything is still there: salary £42,500 marked "AI · reviewed", the signature and the audit log |
| 13 | **5. PDFs & secure export** → **Fact-find PDF** | Share sheet with a branded A4 PDF. AI-sourced values are marked "AI" |
| 14 | **Meeting summary PDF**, **Consent record PDF**, **Audit history PDF** | Branded PDFs, including the signature image, timestamps and hashes |
| 15 | Secure export → passphrase `correct horse battery staple` (twice) → **Create encrypted export** | A `.moexport` file. Decrypt on the PC with `server\decrypt-export.cmd` |
| 16 | Case → **Audit history** | "Audit chain verified" and every action listed, with no client details in the log |

To run the same flow with the **server**, switch Settings → Mode to **My server**, sign in, and repeat steps 5–8. With the server in **live** mode, step 7 shows your own words, transcribed by AssemblyAI. Step 8 then uses Claude.

Sample PDFs produced by the automated workflow test are in [`docs/samples/`](samples/).
