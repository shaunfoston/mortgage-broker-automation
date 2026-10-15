@echo off
REM Decrypt a .moexport file: drag the file onto this script, or run: decrypt-export.cmd path\to\file.moexport
cd /d "%~dp0"
node scripts\decrypt-export.ts %*
pause
