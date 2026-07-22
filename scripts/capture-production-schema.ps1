[CmdletBinding()]
param(
  [ValidateSet("schema-only")]
  [string]$Mode = "schema-only",
  [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$captureRoot = Join-Path $repositoryRoot ".tmp\schema-captures"
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $captureId = [DateTimeOffset]::UtcNow.ToString("yyyyMMddTHHmmssZ")
  $OutputDirectory = Join-Path $captureRoot $captureId
}
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
$validator = Join-Path $PSScriptRoot "validate-production-schema-capture.cjs"
$env:STERISPHERE_SCHEMA_CAPTURE_MODE = $Mode

$preflightJson = & node $validator preflight --output $resolvedOutput
if ($LASTEXITCODE -ne 0) {
  Write-Error "Production schema capture blocked by safety preflight: $preflightJson"
}
$preflight = $preflightJson | ConvertFrom-Json
if (-not $preflight.allowed) {
  throw "Production schema capture blocked before connection."
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if ($null -eq $pgDump) {
  throw "pg_dump is required and was not found on PATH. No database connection was made."
}

New-Item -ItemType Directory -Path $resolvedOutput -ErrorAction Stop | Out-Null
$publicOutput = Join-Path $resolvedOutput "production-public-schema.sql"
$platformOutput = Join-Path $resolvedOutput "production-auth-storage-schema.sql"
$manifestOutput = Join-Path $resolvedOutput "production-schema-manifest.json"
foreach ($candidate in @($publicOutput, $platformOutput, $manifestOutput)) {
  if (Test-Path -LiteralPath $candidate) { throw "Capture output already exists; refusing to overwrite: $candidate" }
}

$projectRef = $env:STERISPHERE_PRODUCTION_PROJECT_REF
$databaseHost = if ([string]::IsNullOrWhiteSpace($env:STERISPHERE_PRODUCTION_DB_HOST)) { "db.$projectRef.supabase.co" } else { $env:STERISPHERE_PRODUCTION_DB_HOST }
$databasePort = if ([string]::IsNullOrWhiteSpace($env:STERISPHERE_PRODUCTION_DB_PORT)) { "5432" } else { $env:STERISPHERE_PRODUCTION_DB_PORT }
$databaseName = if ([string]::IsNullOrWhiteSpace($env:STERISPHERE_PRODUCTION_DB_NAME)) { "postgres" } else { $env:STERISPHERE_PRODUCTION_DB_NAME }
$databaseUser = if ([string]::IsNullOrWhiteSpace($env:STERISPHERE_PRODUCTION_DB_USER)) { "postgres" } else { $env:STERISPHERE_PRODUCTION_DB_USER }
$hostParts = $databaseHost.Split(".")
$redactedHost = if ($hostParts.Count -ge 3) { "$($hostParts[0]).[REDACTED].$($hostParts[-2]).$($hostParts[-1])" } else { "[REDACTED_HOST]" }

Write-Host "Capture approved: environment=production; mode=schema-only; projectRef=$projectRef; host=$redactedHost"
Write-Host "Output directory: $resolvedOutput"
Write-Host "Requested structure: public, extensions, auth, storage. No rows will be requested."

$commonArguments = @(
  "--schema-only",
  "--format=plain",
  "--no-owner",
  "--host=$databaseHost",
  "--port=$databasePort",
  "--username=$databaseUser",
  "--dbname=$databaseName"
)
$previousPgPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $env:STERISPHERE_PRODUCTION_DB_PASSWORD
  & $pgDump.Source @commonArguments "--schema=public" "--schema=extensions" "--file=$publicOutput"
  if ($LASTEXITCODE -ne 0) { throw "Public schema-only capture failed. No manifest was generated." }
  & $pgDump.Source @commonArguments "--schema=auth" "--schema=storage" "--file=$platformOutput"
  if ($LASTEXITCODE -ne 0) { throw "Auth/storage structure-only capture failed. No manifest was generated." }
} finally {
  $env:PGPASSWORD = $previousPgPassword
}

& node $validator validate --input $publicOutput --input $platformOutput --manifest $manifestOutput
if ($LASTEXITCODE -ne 0) {
  throw "Capture validation failed. Raw local evidence remains gitignored and must not be committed."
}
Write-Host "Schema-only capture validated. Review all raw files before any later baseline promotion."
