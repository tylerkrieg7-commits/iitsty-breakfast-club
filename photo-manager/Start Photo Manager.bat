@echo off
cd /d "%~dp0"
docker compose up -d --build
if errorlevel 1 (echo. & echo Docker Desktop is not running. Start it, wait for the whale icon, then run this again. & pause & exit /b)
timeout /t 3 >nul
start http://localhost:8787
