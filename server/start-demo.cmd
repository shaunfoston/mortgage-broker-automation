@echo off
REM Mortgage Options server - DEMO mode (no API keys, fictional transcript)
cd /d "%~dp0"
node --disable-warning=ExperimentalWarning src\index.ts --demo
pause
