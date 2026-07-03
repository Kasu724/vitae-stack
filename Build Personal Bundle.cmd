@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\personal\package.ps1"
if errorlevel 1 pause
