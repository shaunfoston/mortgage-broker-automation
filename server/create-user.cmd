@echo off
REM Create or reset a broker sign-in for the server
cd /d "%~dp0"
node --disable-warning=ExperimentalWarning scripts\create-user.ts %*
pause
