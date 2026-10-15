# Windows setup guide

This guide covers the server on your PC and the app on your phone.
Allow about 45 minutes the first time, most of it waiting for downloads and the cloud build.

You need:

- A Windows 10 or 11 PC
- An Android phone (iPhone: see [IOS_TESTFLIGHT.md](IOS_TESTFLIGHT.md))
- A free Expo account from https://expo.dev/signup, for building the app

For live (real) transcription you also need:

- An AssemblyAI account and API key: https://www.assemblyai.com
- An Anthropic API key: https://console.anthropic.com

---

## 1. Install Node.js

1. Go to https://nodejs.org and install the **LTS** version (24.x). Use the default options.
2. Open **Command Prompt** and run:
   ```bat
   node -v
   ```
   You need **v22.18 or newer**. v24.x is ideal.

## 2. Unzip the project

Unzip `mortgage-options-v0.4.0.zip` to `C:\MortgageOptions`. You should then have `C:\MortgageOptions\mortgage-options\server`, `...\app` and so on.

## 3. Start the server in demo mode (no keys needed)

Double-click `server\start-demo.cmd`, or run:

```bat
cd C:\MortgageOptions\mortgage-options\server
node --disable-warning=ExperimentalWarning src\index.ts --demo
```

You should see `Mode: DEMO` and a list of addresses such as `http://192.168.1.20:3005`.
If Windows Firewall asks, allow access on **Private networks**.
Sign in with **demo** / **demo-password-123**. Demo mode returns a fictional sample transcript and never calls a paid service.

> The server needs **no `npm install`**. It uses only what is built into Node.

## 4. Let your phone reach the server

Pick one option:

**Option A: same Wi-Fi.** The quickest way to test at home.

- The phone and PC must be on the same Wi-Fi.
- In the app, use the `http://192.168.x.x:3005` address the server printed.
- Test builds allow plain `http://` to private Wi-Fi addresses only. Production builds require HTTPS.

**Option B: HTTPS tunnel.** Works anywhere, e.g. on 4G in the van.

```bat
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3005
```

- cloudflared prints `https://something.trycloudflare.com`. Use that address in the app.
- Add `TRUST_PROXY=1` to `server\.env` so sign-in rate limits see real client addresses.
- Quick tunnels change address each time they start. For permanent use, host the server properly (see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)).

## 5. Build and install the Android app

Run in Command Prompt:

```bat
cd C:\MortgageOptions\mortgage-options
npm install
cd app
npx eas-cli login
npx eas-cli init
```

1. `npm install` downloads about 600 MB and takes a few minutes.
2. `eas init` creates the project on your Expo account and prints a **project ID**.
3. Open `app\app.config.ts` in Notepad. Find `projectId:` and paste the ID inside the quotes, like this:
   ```ts
   eas: { projectId: process.env.EAS_PROJECT_ID || 'paste-the-id-here' || undefined },
   ```
4. Start the build:
   ```bat
   npx eas-cli build --platform android --profile preview
   ```
5. The build runs on Expo's servers (about 15–25 minutes; the free tier may queue). When it finishes you get a link and a QR code.
6. Open the link on your phone and download the APK. Tap it to install. If Android asks, allow "Install unknown apps" for your browser.

Full details and the alternative local build are in [ANDROID_BUILD.md](ANDROID_BUILD.md).

## 6. First run on the phone

1. Open **Mortgage Options (Test)**. Enter your name and choose a 6-digit PIN.
2. You start in **Offline demo** mode, which needs no server. Tap **Load fictional demo clients**, or create your own fictional client.
3. To use the server: **Settings → Mode: My server**. Enter the address from step 3 or 4, user `demo`, password `demo-password-123`, then tap **Test connection and sign in**.

Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for the full walkthrough.

## 7. Switch on real transcription (live mode)

1. In `server`, copy `.env.example` to `.env` and open it in Notepad.
2. Generate two secrets. Run this command twice and paste the results into `JWT_SECRET=` and `DATA_KEY=`:
   ```bat
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
3. Set the rest:
   ```ini
   AI_MODE=live
   ASSEMBLYAI_API_KEY=...        (from assemblyai.com → API Keys)
   ANTHROPIC_API_KEY=...         (from console.anthropic.com → API Keys)
   ```
4. Create your own broker sign-in. Double-click `server\create-user.cmd`, or run:
   ```bat
   cd server
   node --disable-warning=ExperimentalWarning scripts\create-user.ts
   ```
5. Double-click `server\start-live.cmd`. It checks both keys with tiny harmless requests before starting. In live mode the `demo` account is switched off automatically.
6. In the app, sign in again with your new account.

**Keep `.env` private. Never put these keys in the app.** The app never sees them.

## 8. Run the automated tests

After `npm install`, double-click `run-tests.cmd`, or run `npm test` in the project folder.

## 9. Open an encrypted export on the PC

```bat
cd server
node scripts\decrypt-export.ts C:\path\to\MO-2026-0001-2026-10-15.moexport
```

Enter the passphrase. You get a folder with `case.json` plus the documents.

## Troubleshooting

| Problem | Fix |
|---|---|
| `node` is not recognised | Reinstall Node.js and tick "Add to PATH", then open a new Command Prompt |
| Phone says "Cannot reach the server" | Same Wi-Fi? Firewall allowed? Use the exact address shown by the server, including `http://` |
| "Use https:// for any server outside your own Wi-Fi" | Use the cloudflared address (option B) |
| Sign-in "Account temporarily locked" | 5 wrong passwords: wait 15 minutes, or reset with `create-user.cmd` |
| Settings shows "Database encryption: OFF" | You are running in Expo Go. Install the APK from step 5 |
| `check-config` says KEY REJECTED | Re-copy the key, with no spaces, into `.env` |
