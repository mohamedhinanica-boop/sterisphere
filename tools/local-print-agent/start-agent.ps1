$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

Write-Host "SteriSphere Print Agent is running. Do not close this window."
Write-Host ""
Write-Host "Starting from $PWD"
Write-Host ""

npm.cmd start

Write-Host ""
Write-Host "SteriSphere Print Agent stopped."
Read-Host "Press Enter to close this window"
