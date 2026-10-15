@echo off
REM Mortgage Options server - LIVE mode (reads server\.env)
cd /d "%~dp0"
if not exist .env (
  echo No .env file. Copy .env.example to .env and fill in your keys first.
  pause
  exit /b 1
)
node --disable-warning=ExperimentalWarning scripts\check-config.ts || (pause & exit /b 1)
node --disable-warning=ExperimentalWarning src\index.ts
pause
