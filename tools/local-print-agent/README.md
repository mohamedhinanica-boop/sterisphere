# SteriSphere Print Agent

## Purpose

The SteriSphere Print Agent is a small Node.js service that runs inside the
clinic network and prints labels to LAN printers on behalf of SteriSphere.

Cloud-hosted SteriSphere cannot open TCP connections directly to private printer
addresses such as `192.168.2.34`. The agent acts as the local print gateway:

```text
SteriSphere browser -> Print Agent workstation -> LAN printer -> label
```

The current MVP supports health checks, printer connection tests,
Zywell-compatible TSPL test labels, and SteriSphere pack labels. It does not
include a Windows service, tray app, installer, pairing token, or production
authentication yet.

## Developer Mode

From this folder:

```powershell
npm start
```

Or run the service directly:

```powershell
node server.js
```

Default configuration:

```text
AGENT_HOST=0.0.0.0
AGENT_PORT=8787
```

`0.0.0.0` allows other devices on the clinic LAN, such as a tablet or laptop, to
reach the agent by using the agent computer's local IP address.

Override the host or port when needed:

```powershell
$env:AGENT_HOST = "127.0.0.1"
$env:AGENT_PORT = "8787"
npm start
```

Use `127.0.0.1` only for same-PC development. Use `0.0.0.0` for clinic gateway
testing.

## Clinic Gateway Mode

Run the agent on one Windows workstation or laptop that is always on, connected
to the clinic network, and able to reach the label printer.

Start with either helper script:

```powershell
.\start-agent.ps1
```

or:

```cmd
start-agent.bat
```

The window should show:

```text
SteriSphere Print Agent is running. Do not close this window.
```

Leave this window open while the clinic is printing. If Windows asks whether to
allow Node.js on private networks, allow it for the clinic/private network.

## Desktop, Laptop, And Tablet Workflow

1. Start the agent on the clinic print workstation.
2. Confirm the startup output shows a LAN URL, for example:

   ```text
   http://192.168.2.10:8787
   ```

3. In SteriSphere Settings -> Printing, set the Local Agent URL / Development
   Override to:

   ```text
   http://<agent-computer-ip>:8787
   ```

4. From another desktop, laptop, or tablet on the same network, open:

   ```text
   http://<agent-computer-ip>:8787/health
   ```

5. If health succeeds, SteriSphere can send print jobs through that workstation.

## Find The Agent Computer IP

On the Windows computer running the agent:

```cmd
ipconfig
```

Look for the active Wi-Fi or Ethernet adapter and copy its IPv4 address, for
example:

```text
IPv4 Address . . . . . . . . . . . : 192.168.2.10
```

Use that address from other devices:

```text
http://192.168.2.10:8787
```

## Optional Windows Startup Shortcut

This MVP does not install a background service. To start the agent automatically
when the Windows user signs in:

1. Right-click `start-agent.bat`.
2. Choose `Create shortcut`.
3. Press `Win + R`.
4. Enter:

   ```text
   shell:startup
   ```

5. Move the shortcut into the Startup folder.
6. Restart Windows and confirm the agent window opens.

The Windows user must remain signed in. A future Windows service or tray
installer will remove this limitation.

## Example Curl Commands

Health check from the same PC:

```powershell
curl.exe http://localhost:8787/health
```

Health check from another LAN device:

```powershell
curl.exe http://<agent-computer-ip>:8787/health
```

Test a printer TCP connection:

```powershell
curl.exe --% -X POST http://localhost:8787/test-connection -H "Content-Type: application/json" -d "{\"host\":\"192.168.2.34\",\"port\":9100}"
```

Print a simple Zywell/TSPL test label:

```powershell
curl.exe --% -X POST http://localhost:8787/print-test-label -H "Content-Type: application/json" -d "{\"host\":\"192.168.2.34\",\"port\":9100,\"labelWidthMm\":50,\"labelHeightMm\":30}"
```

Print a SteriSphere pack label:

```powershell
curl.exe --% -X POST http://localhost:8787/print-pack-label -H "Content-Type: application/json" -d "{\"host\":\"192.168.2.34\",\"port\":9100,\"labelWidthMm\":50,\"labelHeightMm\":30,\"displayName\":\"Exam Kit\",\"packNumber\":\"PACK-2026-0066\",\"cycleNumber\":\"STERI-2026-0001\",\"expiresAt\":\"2027-06-20\",\"qrValue\":\"PACK-2026-0066\",\"template\":\"sterisphere-standard\"}"
```

## Endpoints

### GET /health

Returns agent status, version, and enabled capabilities.

### POST /test-connection

Request:

```json
{
  "host": "192.168.2.34",
  "port": 9100
}
```

### POST /print-test-label

Request:

```json
{
  "host": "192.168.2.34",
  "port": 9100,
  "labelWidthMm": 50,
  "labelHeightMm": 30
}
```

### POST /print-pack-label

Request:

```json
{
  "host": "192.168.2.34",
  "port": 9100,
  "labelWidthMm": 50,
  "labelHeightMm": 30,
  "displayName": "Exam Kit",
  "packNumber": "PACK-2026-0066",
  "cycleNumber": "STERI-2026-0001",
  "expiresAt": "2027-06-20",
  "qrValue": "PACK-2026-0066",
  "template": "sterisphere-standard"
}
```

## Printer Support

The current print endpoints are focused on Zywell-compatible TSPL over raw TCP
port `9100`. The generated test and pack labels use simple 203 dpi-compatible
TSPL for 50 mm x 30 mm labels.

Brother QL, Brother TD, and other printer families are planned for later through
a small driver layer. They are not implemented in this MVP.

## Pack Label Templates

`POST /print-pack-label` accepts an optional `template` field. If omitted, the
agent uses `sterisphere-standard`.

Supported templates:

- `sterisphere-standard`: Official SteriSphere MVP layout with a large QR code
  on the left, strong margins, and a readable text block on the right. This is
  the default production template.

The right-side empty space in `sterisphere-standard` is intentional. It acts as
a safe handling zone for pulling or peeling the label, reducing smudging and
helping staff avoid touching the QR code or printed text.

Planned future templates:

- `compact`
- `large-qr`
- `large-text`
- `custom`
- optional branding/logo template

The endpoint also accepts an optional `displayName` field for the top text line,
such as `Exam Kit`. If `displayName` is missing, the agent falls back to
`packNumber`.

The `sterisphere-standard` TSPL coordinates include physical-printer calibration
constants for 50 mm x 30 mm Zywell media. Different printer density, media gaps,
or feed alignment may require small margin and positioning adjustments.

## CORS And Security

CORS currently allows all origins so the Vercel-hosted SteriSphere frontend can
call the agent from the browser during MVP validation.

Future production versions should replace this with pairing and authentication,
and may restrict allowed origins with an `AGENT_ALLOWED_ORIGIN` style setting.
For now, keep the agent on a trusted clinic/private network only.

## Current Limitations

- No full installer yet.
- No Windows service yet.
- No system tray app yet.
- The agent window must stay open.
- The Windows user must remain signed in for Startup-folder launch.
- No pairing token or authentication yet.
- CORS is open for MVP browser access.
- Only simple Zywell/TSPL test and pack labels are implemented.
- Only `sterisphere-standard` is supported for pack labels.
- No printer driver abstraction yet.
- TCP checks open a fresh socket per request and close it immediately.
- Test-label prints open a fresh socket per request, send TSPL, and close it.
- Pack-label prints open a fresh socket per request, send TSPL, and close it.

## Future Work

- Windows service installer.
- System tray app with status and logs.
- Clinic pairing token or authentication.
- Registered clinic Print Agent discovery.
- Allowed-origin and LAN exposure controls.
- No PHI in agent logs.
- SteriSphere audit trail entries for print events.
- Compact, large-QR, large-text, and custom label templates.
- Optional branding/logo label template.
- Brother QL and Brother TD support.
