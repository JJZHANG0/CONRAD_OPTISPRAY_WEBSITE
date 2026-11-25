@echo off
setlocal
if exist "%~dp0Open-Product-Experience.ps1" (
  set "LAUNCHER=%~dp0Open-Product-Experience.ps1"
) else (
  set "LAUNCHER=%~dp0scripts\Open-Product-Experience.ps1"
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%"
if errorlevel 1 pause
