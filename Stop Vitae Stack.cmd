@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\personal\vitae.ps1" -Action Stop
if errorlevel 1 pause
