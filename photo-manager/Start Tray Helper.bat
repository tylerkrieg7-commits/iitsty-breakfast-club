@echo off
rem Starts the little tray icon that shows how many phones are connected.
rem To start it with Windows: press Win+R, type shell:startup, and put a shortcut to this file there.
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0Photo Manager Tray.ps1"
