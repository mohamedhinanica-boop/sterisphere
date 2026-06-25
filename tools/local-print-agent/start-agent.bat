@echo off
setlocal

cd /d "%~dp0"

echo SteriSphere Print Agent is running. Do not close this window.
echo.
echo Starting from %CD%
echo.

npm.cmd start

echo.
echo SteriSphere Print Agent stopped.
pause
