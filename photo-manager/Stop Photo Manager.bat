@echo off
cd /d "%~dp0"
docker compose down
echo Photo Manager stopped. Your photos are still in the library folder.
pause
