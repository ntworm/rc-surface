@echo off
REM RC Surface data migrator - Windows launcher
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Migrate-RC-Surface-Data.ps1"
exit /b %ERRORLEVEL%
