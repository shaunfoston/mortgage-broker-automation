@echo off
REM Run every automated test (needs: npm install at this folder first)
cd /d "%~dp0"
npm test
pause
