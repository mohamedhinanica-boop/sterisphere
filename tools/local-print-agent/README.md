# SteriSphere Local Print Agent

## Purpose

The Local Print Agent is a local-only Node.js service scaffold for future
SteriSphere direct label printing. It is intended to run on a clinic Windows
workstation or tablet that is on the same LAN as the label printer.

Cloud-hosted SteriSphere cannot directly reach private LAN printer addresses
such as `192.168.2.34`, so this agent will eventually act as the local bridge
between SteriSphere and the printer.

This phase adds health, TCP connection-test, and Zywell/TSPL test-label
printing endpoints. It does not print SteriSphere pack labels or change existing
SteriSphere app printing behavior.

## How to run locally

From this folder:

```powershell
npm start
```

Or run the service directly:

```powershell
node server.js
```

By default the agent listens on:

```text
http://127.0.0.1:8787
```

Optional environment variables:

```powershell
$env:AGENT_HOST = "127.0.0.1"
$env:AGENT_PORT = "8787"
npm start
```

Keep `AGENT_HOST` on `127.0.0.1` for this MVP unless you are doing deliberate
LAN-only development testing.

## Example curl commands

Health check:

```powershell
curl.exe http://127.0.0.1:8787/health
```

Test a printer TCP connection:

```powershell
curl.exe --% -X POST http://127.0.0.1:8787/test-connection -H "Content-Type: application/json" -d "{\"host\":\"192.168.2.34\",\"port\":9100}"
```

Print a simple Zywell/TSPL test label:

```powershell
curl.exe --% -X POST http://127.0.0.1:8787/print-test-label -H "Content-Type: application/json" -d "{\"host\":\"192.168.2.34\",\"port\":9100,\"labelWidthMm\":50,\"labelHeightMm\":30}"
```

Expected success shape:

```json
{
  "ok": true,
  "host": "192.168.2.34",
  "port": 9100
}
```

Expected offline/failure shape:

```json
{
  "ok": false,
  "host": "192.168.2.34",
  "port": 9100,
  "error": "Offline / connection failed.",
  "detail": "Connection timed out."
}
```

Expected print-test-label success shape:

```json
{
  "ok": true
}
```

Expected print-test-label failure shape:

```json
{
  "ok": false,
  "error": "Print failed: Connection timed out."
}
```

## Printer support

The current print endpoint is focused on Zywell-compatible TSPL over raw TCP
port `9100`. The generated test label uses simple 203 dpi-compatible TSPL for a
50 mm x 30 mm label.

Brother QL, Brother TD, and other printer families are planned for later through
a small driver layer. They are not implemented in this MVP.

## Current limitations

- Local development only.
- Only a simple Zywell/TSPL test label is implemented.
- No pack label printing yet.
- No SteriSphere UI integration yet.
- No pairing token or authentication yet.
- No Windows service installer yet.
- No printer driver abstraction yet.
- TCP checks open a fresh socket per request and close it immediately.
- Test-label prints open a fresh socket per request, send TSPL, and close it.

## Security notes

This MVP must not be exposed as a production network service. It is intended for
local development and controlled clinic LAN testing only.

Future production versions need:

- Clinic-specific pairing token or authentication.
- Request authorization from authenticated SteriSphere sessions.
- LAN exposure controls.
- No PHI in agent logs.
- SteriSphere audit trail entries for print events.

## Future endpoints

- `POST /print-pack-label`
