# SteriSphere Local Print Agent

## Purpose

The Local Print Agent is a local-only Node.js service scaffold for future
SteriSphere direct label printing. It is intended to run on a clinic Windows
workstation or tablet that is on the same LAN as the label printer.

Cloud-hosted SteriSphere cannot directly reach private LAN printer addresses
such as `192.168.2.34`, so this agent will eventually act as the local bridge
between SteriSphere and the printer.

This phase only adds health and TCP connection-test endpoints. It does not send
print commands or change existing SteriSphere app printing behavior.

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

## Current limitations

- Local development only.
- No real label printing yet.
- No SteriSphere UI integration yet.
- No pairing token or authentication yet.
- No Windows service installer yet.
- No printer driver abstraction yet.
- TCP checks open a fresh socket per request and close it immediately.

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

- `POST /print-test-label`
- `POST /print-pack-label`
